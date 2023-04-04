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
import { Integer } from "neo4j-driver";
import type { ConcreteEntity } from "../../../schema-model/entity/ConcreteEntity";
import type { Relationship } from "../../../schema-model/relationship/Relationship";
import type { ConnectionWhereArg, GraphQLOptionsArg, GraphQLWhereArg } from "../../../types";
import { filterTruthy } from "../../../utils/utils";
import { AttributeField } from "../ast/projection/AttributeField";
import { ConnectionField } from "../ast/projection/connection/ConnectionField";
import { RelationshipField } from "../ast/projection/RelationshipField";
import type { SelectionSetField } from "../ast/projection/SelectionSetField";
import type { FilterASTFactory } from "./FilterASTFactory";
import { parseSelectionSetField } from "./parsers/parse-selection-set-field";
import type { SortAndPaginationASTFactory } from "./SortAndPaginationASTFactory";

export class SelectionSetASTFactory {
    private filterFactory: FilterASTFactory;
    private sortAndPaginationFactory: SortAndPaginationASTFactory;

    constructor(filterFactory: FilterASTFactory, sortFactory: SortAndPaginationASTFactory) {
        this.filterFactory = filterFactory;
        this.sortAndPaginationFactory = sortFactory;
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
