import type { ResolveTree } from "graphql-parse-resolve-info";
import { ConcreteEntity } from "../../../../schema-model/entity/ConcreteEntity";
import type { Entity } from "../../../../schema-model/entity/Entity";
import type { Neo4jGraphQLSchemaModel } from "../../../../schema-model/Neo4jGraphQLSchemaModel";
import type { Relationship } from "../../../../schema-model/relationship/Relationship";
import type { ConnectionWhereArg, GraphQLWhereArg } from "../../../../types";
import { asArray } from "../../../../utils/utils";
import type { FilterAST } from "../ast/filter/FilterAST";
import { LogicalFilterAST } from "../ast/filter/LogicalFilter";
import { PropertyFilterAST } from "../ast/filter/PropertyFilterAST";
import { RelationshipFilterAST } from "../ast/filter/RelationshipFilterAST";
import { ConnectionProjectionFieldAST } from "../ast/projection/ConnectionProjection";
import { ProjectionAST } from "../ast/projection/Projection";
import { ProjectionFieldAST } from "../ast/projection/ProjectionField";
import { RelationshipProjectionFieldAST } from "../ast/projection/RelationshipProjectionField";
import { QueryAST } from "../ast/QueryAST";
import { parseWhereField } from "./parse-operation";

export class QueryASTFactory {
    private schemaModel: Neo4jGraphQLSchemaModel;

    constructor(schemaModel: Neo4jGraphQLSchemaModel) {
        this.schemaModel = schemaModel;
    }

    public createQueryAST(resolveTree: ResolveTree, entity: Entity): QueryAST {
        if (!(entity instanceof ConcreteEntity)) throw new Error("TBD");
        const ast = new QueryAST(entity);

        const where = resolveTree.args.where as GraphQLWhereArg | undefined;
        if (where) {
            const filters = this.createFilterASTs(where, entity);
            ast.addFilter(filters);
        }
        const projectionFields = { ...resolveTree.fieldsByTypeName[entity.name] };
        const projection = this.createProjectionAST(projectionFields, entity);
        ast.addProjection(projection);
        return ast;
    }

    private createEdgeFilterAST(
        where: GraphQLWhereArg,
        relationship: Relationship
    ): PropertyFilterAST | LogicalFilterAST {
        const filterASTs = Object.entries(where).map(([prop, value]) => {
            if (["NOT", "OR", "AND"].includes(prop)) {
                return this.createEdgeLogicalFilter(prop as "NOT" | "OR" | "AND", value, relationship);
            }

            const { fieldName, operator, isNot, isConnection } = parseWhereField(prop);

            const attribute = relationship.findAttribute(fieldName);
            if (!attribute) throw new Error(`no filter attribute ${prop}`);
            return new PropertyFilterAST({
                attribute,
                comparisonValue: value,
                operator,
                isNot,
            });
        });

        if (filterASTs.length > 1) {
            return new LogicalFilterAST({
                operation: "AND",
                filters: filterASTs,
            });
        }

        return filterASTs[0];
    }

    private createFilterASTs(where: GraphQLWhereArg, entity: ConcreteEntity): FilterAST {
        const filterASTs = Object.entries(where).map(([prop, value]) => {
            if (["NOT", "OR", "AND"].includes(prop)) {
                return this.createLogicalFilter(prop as "NOT" | "OR" | "AND", value, entity);
            }
            const { fieldName, operator, isNot, isConnection } = parseWhereField(prop);
            const relationship = entity.findRelationship(fieldName);
            if (isConnection) {
                if (!relationship) throw new Error(`Relationship not found for connection ${fieldName}`);
                return this.createConnectionFilterAST(value as ConnectionWhereArg, relationship, {
                    isNot,
                    operator,
                });
            }

            if (relationship) {
                return this.createRelationshipFilterAST(value as GraphQLWhereArg, relationship, {
                    isNot,
                    operator,
                });
            }

            const attribute = entity.findAttribute(fieldName);
            if (!attribute) throw new Error(`no filter attribute ${prop}`);

            return new PropertyFilterAST({
                attribute,
                comparisonValue: value,
                operator,
                isNot,
            });
        });

        if (filterASTs.length > 1) {
            return new LogicalFilterAST({
                operation: "AND",
                filters: filterASTs,
            });
        }

        return filterASTs[0];
    }

    private createEdgeLogicalFilter(
        operation: "OR" | "AND" | "NOT",
        where: GraphQLWhereArg[] | GraphQLWhereArg,
        relationship: Relationship
    ): LogicalFilterAST {
        const nestedFilters = asArray(where).flatMap((nestedWhere) => {
            return this.createEdgeFilterAST(nestedWhere, relationship);
        });
        return new LogicalFilterAST({
            operation,
            filters: nestedFilters,
        });
    }

    private createLogicalFilter(
        operation: "OR" | "AND" | "NOT",
        where: GraphQLWhereArg[] | GraphQLWhereArg,
        entity: ConcreteEntity
    ): LogicalFilterAST {
        const nestedFilters = asArray(where).flatMap((nestedWhere) => {
            return this.createFilterASTs(nestedWhere, entity);
        });
        return new LogicalFilterAST({
            operation,
            filters: nestedFilters,
        });
    }

    private createConnectionFilterAST(
        where: ConnectionWhereArg,
        relationship: Relationship,
        filterOps: { isNot: boolean; operator: WhereOperator | undefined } = { isNot: false, operator: undefined }
    ): RelationshipFilterAST {
        const nodeWhere = where.node;
        if (nodeWhere) {
            return this.createRelationshipFilterAST(nodeWhere, relationship, filterOps);
        }
        return this.createRelationshipFilterAST({}, relationship, filterOps);
    }

    private createRelationshipFilterAST(
        where: GraphQLWhereArg,
        relationship: Relationship,
        filterOps: { isNot: boolean; operator: WhereOperator | undefined }
    ): RelationshipFilterAST {
        const relationshipFilter = new RelationshipFilterAST({
            relationship: relationship,
            isNot: filterOps.isNot,
            operator: filterOps.operator,
        });

        const targetNode = relationship.target;
        const targetNodeFilters = this.createFilterASTs(where, targetNode);

        relationshipFilter.addTargetNodeFilter(targetNodeFilters);

        return relationshipFilter;
    }

    private createProjectionAST(projectionFields: Record<string, ResolveTree>, entity: ConcreteEntity): ProjectionAST {
        const projectionColumns = Object.entries(projectionFields).map(([_, value]) => {
            return this.createProjectionColumnAST(value, entity);
        });

        return new ProjectionAST(projectionColumns);
    }

    private createProjectionColumnAST(
        value: ResolveTree,
        entity: ConcreteEntity
    ): ProjectionFieldAST | RelationshipProjectionFieldAST | ConnectionProjectionFieldAST {
        // TODO: relationship projections

        const { fieldName, isConnection } = parseProjectionField(value.name);

        const relationship = entity.findRelationship(fieldName);
        if (isConnection) {
            if (!relationship) throw new Error(`Relationship not found for connection ${fieldName}`);
            return this.createConnectionProjectionColumnAST({
                relationship,
                resolveTree: value,
            });
        }

        if (relationship) {
            return this.createRelationshipProjection({
                relationship,
                resolveTree: value,
            });
        }

        const attribute = entity.findAttribute(fieldName);
        if (!attribute) throw new Error(`no attribute ${fieldName}`);
        return new ProjectionFieldAST({
            attribute,
            alias: value.alias,
        });
    }

    private createEdgeProjectionColumnAST({
        value,
        relationship,
    }: {
        value: ResolveTree;
        relationship: Relationship;
    }): ProjectionFieldAST {
        const { fieldName, isConnection } = parseProjectionField(value.name);
        const attribute = relationship.findAttribute(fieldName);
        if (!attribute) throw new Error(`no relationship attribute ${fieldName}`);
        return new ProjectionFieldAST({
            attribute,
            alias: value.alias,
        });
    }

    private createConnectionProjectionColumnAST({
        relationship,
        resolveTree,
    }: {
        relationship: Relationship;
        resolveTree: ResolveTree;
    }): ConnectionProjectionFieldAST {
        // TODO: connection filter
        const childEntity = relationship.target;
        const alias = resolveTree.alias;
        const directed = Boolean(resolveTree.args.directed);
        const resolveTreeFields = { ...resolveTree.fieldsByTypeName[relationship.connectionFieldTypename] };

        const edgesProjection: ResolveTree = resolveTreeFields.edges || {};
        const edgeProjectionFields = { ...edgesProjection.fieldsByTypeName[relationship.relationshipFieldTypename] };

        const nodesProjection: ResolveTree = edgeProjectionFields.node || {};
        delete edgeProjectionFields.node;

        const nodesProjectionFields = { ...nodesProjection.fieldsByTypeName[childEntity.name] };

        const nodeFieldsAST = Object.entries(nodesProjectionFields).map(([_, value]) => {
            return this.createProjectionColumnAST(value, childEntity);
        });

        const edgeFieldsAST = Object.entries(edgeProjectionFields).map(([_, value]) => {
            return this.createEdgeProjectionColumnAST({ value, relationship });
        });

        const connectionWhere = (resolveTree.args.where || {}) as ConnectionWhereArg;

        // if (["NOT", "OR", "AND"].includes(prop)) {
        //     return this.createLogicalFilter(prop as "NOT" | "OR" | "AND", value, entity);
        // }
        // const filterAST = this.createConnectionFilterAST(connectionWhere, relationship);

        const relatedNodeFilters = connectionWhere.node
            ? this.createFilterASTs(connectionWhere.node, childEntity)
            : undefined;
        const edgeFilter = connectionWhere.edge
            ? this.createEdgeFilterAST(connectionWhere.edge, relationship)
            : undefined;

        return new ConnectionProjectionFieldAST({
            relationship,
            alias,
            directed,
            nodeProjectionFields: nodeFieldsAST,
            edgeProjectionFields: edgeFieldsAST,
            nodeFilter: relatedNodeFilters,
            relationshipFilter: edgeFilter,
        });
    }

    private createRelationshipProjection({
        relationship,
        resolveTree,
    }: {
        relationship: Relationship;
        resolveTree: ResolveTree;
    }): RelationshipProjectionFieldAST {
        const childEntity = relationship.target;
        const alias = resolveTree.alias;
        const directed = Boolean(resolveTree.args.directed);
        const resolveTreeFields = { ...resolveTree.fieldsByTypeName[childEntity.name] };

        const projectionFields = Object.entries(resolveTreeFields).map(([_, value]) => {
            return this.createProjectionColumnAST(value, childEntity as any);
        });
        return new RelationshipProjectionFieldAST({
            relationship,
            alias,
            directed,
            projectionFields,
        });
    }
}
