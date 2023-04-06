/*
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { ResolveTree } from "graphql-parse-resolve-info";
import type { Integer } from "neo4j-driver";
import type { ConcreteEntity } from "../../../schema-model/entity/ConcreteEntity";
import type { Relationship } from "../../../schema-model/relationship/Relationship";
import type { ConnectionWhereArg, GraphQLOptionsArg, GraphQLWhereArg } from "../../../types";
import { filterTruthy } from "../../../utils/utils";
import { AggregationSelectionSet } from "../ast/projection/aggregations/AggregationSelectionSet";
import { EdgeAggregationSelectionSet } from "../ast/projection/aggregations/EdgeAggregationSelectionSet";
import { NodeAggregationSelectionSet } from "../ast/projection/aggregations/NodeAggregationSelectionSet";
import { AttributeField } from "../ast/projection/AttributeField";
import { ConnectionField } from "../ast/projection/connection/ConnectionField";
import { RelationshipField } from "../ast/projection/RelationshipField";
import type { SelectionSetField } from "../ast/projection/SelectionSetField";
import { AggregationFieldFactory } from "./AggregationFieldFactory";
import type { FilterASTFactory } from "./FilterASTFactory";
import { parseSelectionSetField } from "./parsers/parse-selection-set-field";
import type { SortAndPaginationASTFactory } from "./SortAndPaginationASTFactory";

export class SelectionSetASTFactory {
    private filterFactory: FilterASTFactory;
    private sortAndPaginationFactory: SortAndPaginationASTFactory;
    private aggregationFieldFactory: AggregationFieldFactory;

    constructor(filterFactory: FilterASTFactory, sortFactory: SortAndPaginationASTFactory) {
        this.filterFactory = filterFactory;
        this.sortAndPaginationFactory = sortFactory;
        this.aggregationFieldFactory = new AggregationFieldFactory();
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
        const { fieldName, isConnection, isAggregation } = parseSelectionSetField(value.name);
        const relationship = entity.findRelationship(fieldName);
        if (isConnection) {
            if (!relationship) throw new Error(`Relationship not found for connection ${fieldName}`);
            return this.createConnectionSelectionSet({
                relationship,
                resolveTree: value,
            });
        }

        if (isAggregation) {
            if (!relationship) throw new Error(`Relationship not found for aggregation ${fieldName}`);
            return this.createAggregationSelectionSet({
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

        const relationshipField = new RelationshipField({
            relationship,
            alias,
            directed,
            selectionSetFields: filterTruthy(selectionSetFields),
            filters: relationshipFilters,
        });

        const options = resolveTree.args.options as GraphQLOptionsArg | undefined;

        if (options) {
            const sort = this.sortAndPaginationFactory.createSortFields(options, childEntity);
            relationshipField.addSort(...sort);

            const pagination = this.sortAndPaginationFactory.createPagination(options);
            if (pagination) {
                relationshipField.addPagination(pagination);
            }
        }

        return relationshipField;
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

        const connectionField = new ConnectionField({
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

        const first = resolveTree.args.first as number | Integer | undefined;
        if (first) {
            const pagination = this.sortAndPaginationFactory.createPagination({
                limit: first,
            });
            if (pagination) {
                connectionField.addPagination(pagination);
            }
        }

        // const options: GraphQLOptionsArg = {
        //     first: resolveTree.args,
        // };
        // resolveTree.args.options as GraphQLOptionsArg | undefined;
        // console.log(options);
        // if (options) {
        //     const sort = this.sortAndPaginationFactory.createSortFields(options, childEntity);
        //     relationshipField.addSort(...sort);

        //     const pagination = this.sortAndPaginationFactory.createPagination(options);
        //     if (pagination) {
        //         relationshipField.addPagination(pagination);
        //     }
        // }

        return connectionField;
    }

    private createAggregationSelectionSet({
        resolveTree,
        relationship,
    }: {
        resolveTree: ResolveTree;
        relationship: Relationship;
    }): AggregationSelectionSet {
        const childEntity = relationship.target as ConcreteEntity;
        const alias = resolveTree.alias;
        const directed = Boolean(resolveTree.args.directed);
        // const relationshipWhere: GraphQLWhereArg = (resolveTree.args.where || {}) as GraphQLWhereArg;

        const resolveTreeFields = { ...resolveTree.fieldsByTypeName[relationship.aggregationFieldTypename] };
        const aggregationSelectionSet = new AggregationSelectionSet({
            relationship,
            alias,
            directed,
        });

        if (resolveTreeFields.count) {
            const countField = this.aggregationFieldFactory.generateCountField(
                resolveTreeFields.count,
                directed,
                relationship
            );
            aggregationSelectionSet.addField(countField);
        }

        if (resolveTreeFields.node) {
            const nodeTreeFields = {
                ...resolveTreeFields.node.fieldsByTypeName[relationship.aggregationNodeFieldTypename],
            };

            const aggregationNodeSelectionSet = new NodeAggregationSelectionSet(relationship, directed);
            for (const value of Object.values(nodeTreeFields)) {
                const attribute = childEntity.findAttribute(value.name);
                if (!attribute) throw new Error(`Attribute ${value.name} not found in ${childEntity.name}`);
                const field = this.aggregationFieldFactory.generateAggregationAttributeSelectionSet(attribute, value);
                aggregationNodeSelectionSet.addField(field);
            }

            aggregationSelectionSet.addNodeSelectionSet(aggregationNodeSelectionSet);
        }

        if (resolveTreeFields.edge) {
            const edgeTreeFields = {
                ...resolveTreeFields.edge.fieldsByTypeName[relationship.aggregationEdgeFieldTypename],
            };

            const aggregationEdgeSelectionSet = new EdgeAggregationSelectionSet(relationship, directed);
            for (const value of Object.values(edgeTreeFields)) {
                console.log("edge", value);
                const attribute = relationship.findAttribute(value.name);
                if (!attribute) throw new Error(`Attribute ${value.name} not found in ${relationship.name}`);
                const field = this.aggregationFieldFactory.generateAggregationAttributeSelectionSet(attribute, value);
                aggregationEdgeSelectionSet.addField(field);
            }

            aggregationSelectionSet.addEdgeSelectionSet(aggregationEdgeSelectionSet);
        }

        // const fields = filterTruthy(
        //     Object.entries(resolveTreeFields).map(([key, value]): AggregationField | undefined => {
        //         return undefined;
        //     })
        // );

        return aggregationSelectionSet;
        // const selectionSetFields = Object.entries(resolveTreeFields).map(([_, value]) => {
        //     return this.createSelectionSetField(value, childEntity as any);
        // });

        // const relationshipFilters = this.filterFactory.createFilters(relationshipWhere, childEntity);

        // const relationshipField = new RelationshipField({
        //     relationship,
        //     alias,
        //     directed,
        //     selectionSetFields: filterTruthy(selectionSetFields),
        //     filters: relationshipFilters,
        // });
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
