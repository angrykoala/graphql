import { asArray } from "@graphql-tools/utils";
import type { ConcreteEntity } from "../../../schema-model/entity/ConcreteEntity";
import type { Relationship } from "../../../schema-model/relationship/Relationship";
import type { ConnectionWhereArg, GraphQLWhereArg } from "../../../types";
import { filterTruthy } from "../../../utils/utils";
import { ConnectionEdgeFilter } from "../ast/filters/connection/ConnectionEdgeFilter";
import { ConnectionFilter } from "../ast/filters/connection/ConnectionFilter";
import { ConnectionNodeFilter } from "../ast/filters/connection/ConnectionNodeFilter";
import type { Filter } from "../ast/filters/Filter";
import { LogicalFilter } from "../ast/filters/LogicalFilter";
import { PropertyFilter } from "../ast/filters/PropertyFilter";
import { RelationshipFilter } from "../ast/filters/RelationshipFilter";
import type { RelationshipWhereOperator } from "../operators";
import { isRelationshipOperator } from "../operators";
import { parseConnectionWhereFields, parseWhereField } from "./parsers/parse-where-field";

export class FilterASTFactory {
    public createFilters(where: GraphQLWhereArg, entity: ConcreteEntity): Filter[] {
        const filterASTs = Object.entries(where).map(([prop, value]): Filter | undefined => {
            if (["NOT", "OR", "AND"].includes(prop)) {
                return this.createLogicalFilter(prop as "NOT" | "OR" | "AND", value, entity);
            }
            const { fieldName, operator, isNot, isConnection } = parseWhereField(prop);
            const relationship = entity.findRelationship(fieldName);
            if (isConnection) {
                if (!relationship) throw new Error(`Relationship not found for connection ${fieldName}`);
                if (operator && !isRelationshipOperator(operator)) {
                    throw new Error(`Invalid operator ${operator} for relationship`);
                }

                return this.createConnectionFilter(value as ConnectionWhereArg, relationship, {
                    isNot,
                    operator,
                });
            }

            if (relationship) {
                if (operator && !isRelationshipOperator(operator)) {
                    throw new Error(`Invalid operator ${operator} for relationship`);
                }

                return this.createRelationshipFilter(value as GraphQLWhereArg, relationship, {
                    isNot,
                    operator,
                });
            }

            const attribute = entity.findAttribute(fieldName);
            if (!attribute) throw new Error(`no filter attribute ${prop}`);

            return new PropertyFilter({
                attribute,
                comparisonValue: value,
                operator,
                isNot,
            });
        });

        return filterTruthy(filterASTs);
    }

    private createLogicalFilter(
        operation: "OR" | "AND" | "NOT",
        where: GraphQLWhereArg[] | GraphQLWhereArg,
        entity: ConcreteEntity
    ): LogicalFilter {
        const nestedFilters = asArray(where).flatMap((nestedWhere) => {
            return this.createFilters(nestedWhere, entity);
        });
        return new LogicalFilter({
            operation,
            filters: nestedFilters,
        });
    }

    private createRelationshipFilter(
        where: GraphQLWhereArg,
        relationship: Relationship,
        filterOps: { isNot: boolean; operator: RelationshipWhereOperator | undefined }
    ): RelationshipFilter {
        const relationshipFilter = new RelationshipFilter({
            relationship: relationship,
            isNot: filterOps.isNot,
            operator: filterOps.operator,
        });

        const targetNode = relationship.target as ConcreteEntity; // TODO: accept entities
        const targetNodeFilters = this.createFilters(where, targetNode);

        relationshipFilter.addTargetNodeFilter(...targetNodeFilters);

        return relationshipFilter;
    }

    private createConnectionFilter(
        where: ConnectionWhereArg,
        relationship: Relationship,
        filterOps: { isNot: boolean; operator: RelationshipWhereOperator | undefined }
    ): ConnectionFilter {
        const connectionFilter = new ConnectionFilter({
            relationship: relationship,
            isNot: filterOps.isNot,
            operator: filterOps.operator,
        });

        const targetNode = relationship.target as ConcreteEntity; // TODO: accept entities

        const edgeFilters: Array<LogicalFilter | PropertyFilter> = [];
        Object.entries(where).forEach(([key, value]: [string, GraphQLWhereArg | GraphQLWhereArg[]]) => {
            const connectionWhereField = parseConnectionWhereFields(key);
            if (connectionWhereField.fieldName === "edge") {
                console.log(connectionWhereField.fieldName, value);
            }
            if (connectionWhereField.fieldName === "node") {
                const targetNodeFilters = this.createFilters(value, targetNode);
                const connectionNodeFilter = new ConnectionNodeFilter({
                    isNot: connectionWhereField.isNot,
                    filters: targetNodeFilters,
                });

                connectionFilter.addConnectionNodeFilter(connectionNodeFilter);
            }

            //         const nodeFilter = new ConnectionNodeFilter({
            //             isNot: connectionWhereField.isNot,
            //             filters: targetNodeFilters,
            //         });
            //         connectionFilter.addConnectionNodeFilter(nodeFilter);
            //     }

            //     if (connectionWhereField.fieldName === "edge") {
            //     }

            //     // if (["NOT", "OR", "AND"].includes(prop)) {
            //     //     return this.createLogicalFilter(prop as "NOT" | "OR" | "AND", value, entity);
            //     // }
        });

        // node?: GraphQLWhereArg;
        // node_NOT?: GraphQLWhereArg;
        // edge?: GraphQLWhereArg;
        // edge_NOT?: GraphQLWhereArg;
        // AND?: ConnectionWhereArg[];
        // OR?: ConnectionWhereArg[];
        // NOT?: ConnectionWhereArg;

        // const targetNodeFilters = this.createFilters(where, targetNode);

        // connectionFilter.addTargetNodeFilter(...targetNodeFilters);
        // connectionFilter.addRelationshipFilter(...edgeFilters);

        return connectionFilter;
    }

    public createConnectionNodeFilters({
        where,
        relationship,
    }: {
        where: ConnectionWhereArg;
        relationship: Relationship;
    }): ConnectionNodeFilter[] {
        const nodeFilters: ConnectionNodeFilter[] = [];
        const targetNode = relationship.target as ConcreteEntity; // TODO: accept entities

        Object.entries(where).forEach(([key, value]: [string, GraphQLWhereArg | GraphQLWhereArg[]]) => {
            const connectionWhereField = parseConnectionWhereFields(key);
            if (connectionWhereField.fieldName === "node") {
                const targetNodeFilters = this.createFilters(value, targetNode);

                const nodeFilter = new ConnectionNodeFilter({
                    isNot: connectionWhereField.isNot,
                    filters: targetNodeFilters,
                });

                nodeFilters.push(nodeFilter);
            }

            // if (["NOT", "OR", "AND"].includes(prop)) {
            //     return this.createLogicalFilter(prop as "NOT" | "OR" | "AND", value, entity);
            // }
        });
        return nodeFilters;
    }

    public createConnectionEdgeFilters({
        where,
        relationship,
    }: {
        where: ConnectionWhereArg;
        relationship: Relationship;
    }): ConnectionEdgeFilter[] {
        const edgeFilters: ConnectionEdgeFilter[] = [];

        Object.entries(where).forEach(([key, value]: [string, GraphQLWhereArg | GraphQLWhereArg[]]) => {
            const connectionWhereField = parseConnectionWhereFields(key);
            if (connectionWhereField.fieldName === "edge") {
                const targetNodeFilters = this.createEdgeFilters(value, relationship);

                const nodeFilter = new ConnectionEdgeFilter({
                    isNot: connectionWhereField.isNot,
                    filters: targetNodeFilters,
                });

                edgeFilters.push(nodeFilter);
            }

            // if (["NOT", "OR", "AND"].includes(prop)) {
            //     return this.createLogicalFilter(prop as "NOT" | "OR" | "AND", value, entity);
            // }
        });
        return edgeFilters;
    }

    private createEdgeFilters(
        where: GraphQLWhereArg,
        relationship: Relationship
    ): Array<LogicalFilter | PropertyFilter> {
        const filterASTs = Object.entries(where).map(([prop, value]): LogicalFilter | PropertyFilter | undefined => {
            if (["NOT", "OR", "AND"].includes(prop)) {
                return this.createEdgeLogicalFilter(prop as "NOT" | "OR" | "AND", value, relationship);
            }
            const { fieldName, operator, isNot, isConnection } = parseWhereField(prop);
            const attribute = relationship.findAttribute(fieldName);
            if (!attribute) throw new Error(`no filter attribute ${prop}`);

            return new PropertyFilter({
                attribute,
                comparisonValue: value,
                operator,
                isNot,
            });
        });

        return filterTruthy(filterASTs);
    }

    private createEdgeLogicalFilter(
        operation: "OR" | "AND" | "NOT",
        where: GraphQLWhereArg[] | GraphQLWhereArg,
        relationship: Relationship
    ): LogicalFilter {
        const nestedFilters = asArray(where).flatMap((nestedWhere) => {
            return this.createEdgeFilters(nestedWhere, relationship);
        });
        return new LogicalFilter({
            operation,
            filters: nestedFilters,
        });
    }
}
