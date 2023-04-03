import type { ResolveTree } from "graphql-parse-resolve-info";
import type { ConcreteEntity } from "../../../schema-model/entity/ConcreteEntity";
import type { Relationship } from "../../../schema-model/relationship/Relationship";
import type { ConnectionWhereArg, GraphQLWhereArg } from "../../../types";
import { filterTruthy } from "../../../utils/utils";
import { AttributeField } from "../ast/projection/AttributeField";
import { ConnectionField } from "../ast/projection/connection/ConnectionField";
import { RelationshipField } from "../ast/projection/RelationshipField";
import type { SelectionSetField } from "../ast/projection/SelectionSetField";
import type { FilterASTFactory } from "./FilterASTFactory";
import { parseSelectionSetField } from "./parsers/parse-selection-set-field";

export class SelectionSetASTFactory {
    private filterFactory: FilterASTFactory;

    constructor(filterFactor: FilterASTFactory) {
        this.filterFactory = filterFactor;
    }

    public createSelectionSetAST(
        projectionFields: Record<string, ResolveTree>,
        entity: ConcreteEntity
    ): SelectionSetField[] {
        const selectionFields = Object.entries(projectionFields).map(([_, value]) => {
            return this.createSelectionSetField(value, entity);
        });

        return filterTruthy(selectionFields);
    }

    private createSelectionSetField(value: ResolveTree, entity: ConcreteEntity): SelectionSetField | undefined {
        // TODO: relationship projections
        const { fieldName, isConnection } = parseSelectionSetField(value.name);
        const relationship = entity.findRelationship(fieldName);
        if (isConnection) {
            if (!relationship) throw new Error(`Relationship not found for connection ${fieldName}`);
            return this.createConnectionSelectionSet({
                relationship,
                resolveTree: value,
            });
        }

        if (relationship) {
            return this.createRelationshipSelectionSet({
                relationship,
                resolveTree: value,
            });
        }

        const attribute = entity.findAttribute(fieldName);
        if (!attribute) throw new Error(`no attribute ${fieldName}`);
        return new AttributeField({
            attribute,
            alias: value.alias,
        });
    }

    private createRelationshipSelectionSet({
        relationship,
        resolveTree,
    }: {
        relationship: Relationship;
        resolveTree: ResolveTree;
    }): RelationshipField {
        const childEntity = relationship.target as ConcreteEntity;
        const alias = resolveTree.alias;
        const directed = Boolean(resolveTree.args.directed);
        const relationshipWhere: GraphQLWhereArg = (resolveTree.args.where || {}) as GraphQLWhereArg;

        const resolveTreeFields = { ...resolveTree.fieldsByTypeName[childEntity.name] };

        const selectionSetFields = Object.entries(resolveTreeFields).map(([_, value]) => {
            return this.createSelectionSetField(value, childEntity as any);
        });

        const relationshipFilters = this.filterFactory.createFilters(relationshipWhere, childEntity);

        return new RelationshipField({
            relationship,
            alias,
            directed,
            selectionSetFields: filterTruthy(selectionSetFields),
            filters: relationshipFilters,
        });
    }

    private createConnectionSelectionSet({
        relationship,
        resolveTree,
    }: {
        relationship: Relationship;
        resolveTree: ResolveTree;
    }): ConnectionField {
        // TODO: connection filter
        const childEntity = relationship.target as ConcreteEntity;
        const alias = resolveTree.alias;
        const directed = Boolean(resolveTree.args.directed);
        const resolveTreeFields = { ...resolveTree.fieldsByTypeName[relationship.connectionFieldTypename] };

        const edgesProjection: ResolveTree | undefined = resolveTreeFields.edges;
        let edgeProjectionFields: Record<string, ResolveTree> = {};
        if (edgesProjection) {
            edgeProjectionFields = {
                ...edgesProjection.fieldsByTypeName[relationship.relationshipFieldTypename],
            };
        }

        const nodesProjection: ResolveTree = edgeProjectionFields.node;
        delete edgeProjectionFields.node;

        let nodesProjectionFields: Record<string, ResolveTree> = {};
        if (nodesProjection) {
            nodesProjectionFields = { ...nodesProjection.fieldsByTypeName[childEntity.name] };
        }

        const nodeFieldsAST = Object.entries(nodesProjectionFields).map(([_, value]) => {
            return this.createSelectionSetField(value, childEntity);
        });

        const edgeFieldsAST = Object.entries(edgeProjectionFields).map(([_, value]) => {
            return this.createEdgeSelectionSet({ value, relationship });
        });

        const connectionWhere = (resolveTree.args.where || {}) as ConnectionWhereArg;

        // if (["NOT", "OR", "AND"].includes(prop)) {
        //     return this.createLogicalFilter(prop as "NOT" | "OR" | "AND", value, entity);
        // }
        const nodeFilters = this.filterFactory.createConnectionNodeFilters({
            where: connectionWhere,
            relationship,
        });

        const edgeFilters = this.filterFactory.createConnectionEdgeFilters({
            where: connectionWhere,
            relationship,
        });

        return new ConnectionField({
            relationship,
            alias,
            directed,
            nodeSelectionSet: filterTruthy(nodeFieldsAST),
            edgeSelectionSet: edgeFieldsAST,
            targetNodeFilters: nodeFilters,
            targetEdgeFilters: edgeFilters,
            // nodeFilter: relatedNodeFilters,
            // relationshipFilter: edgeFilter,
        });
    }

    private createEdgeSelectionSet({
        value,
        relationship,
    }: {
        value: ResolveTree;
        relationship: Relationship;
    }): AttributeField {
        const { fieldName } = parseSelectionSetField(value.name);
        const attribute = relationship.findAttribute(fieldName);
        if (!attribute) throw new Error(`no relationship attribute ${fieldName}`);
        return new AttributeField({
            attribute,
            alias: value.alias,
        });
    }
}
