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

import { asArray, mergeDeep } from "@graphql-tools/utils";
import * as Cypher from "@neo4j/cypher-builder";
import type { FieldsByTypeName, ResolveTree } from "graphql-parse-resolve-info";
import { cursorToOffset } from "graphql-relay";
import { Integer } from "neo4j-driver";
import type { EntityAdapter } from "../../../schema-model/entity/EntityAdapter";
import type { ConcreteEntityAdapter } from "../../../schema-model/entity/model-adapters/ConcreteEntityAdapter";
import type { InterfaceEntityAdapter } from "../../../schema-model/entity/model-adapters/InterfaceEntityAdapter";
import type { UnionEntityAdapter } from "../../../schema-model/entity/model-adapters/UnionEntityAdapter";
import { RelationshipAdapter } from "../../../schema-model/relationship/model-adapters/RelationshipAdapter";
import type { ConnectionQueryArgs, GraphQLOptionsArg } from "../../../types";
import type { Neo4jGraphQLTranslationContext } from "../../../types/neo4j-graphql-translation-context";
import { filterTruthy, isObject, isRecord, isString } from "../../../utils/utils";
import { checkEntityAuthentication } from "../../authorization/check-authentication";
import { FulltextScoreField } from "../ast/fields/FulltextScoreField";
import type { Filter } from "../ast/filters/Filter";
import { FulltextScoreFilter } from "../ast/filters/property-filters/FulltextScoreFilter";
import { AggregationOperation } from "../ast/operations/AggregationOperation";
import { ConnectionReadOperation } from "../ast/operations/ConnectionReadOperation";
import { CreateOperation } from "../ast/operations/CreateOperation";
import type { FulltextOptions } from "../ast/operations/FulltextOperation";
import { FulltextOperation } from "../ast/operations/FulltextOperation";
import { ReadOperation } from "../ast/operations/ReadOperation";
import { CompositeAggregationOperation } from "../ast/operations/composite/CompositeAggregationOperation";
import { CompositeAggregationPartial } from "../ast/operations/composite/CompositeAggregationPartial";
import { CompositeConnectionPartial } from "../ast/operations/composite/CompositeConnectionPartial";
import { CompositeConnectionReadOperation } from "../ast/operations/composite/CompositeConnectionReadOperation";
import { CompositeReadOperation } from "../ast/operations/composite/CompositeReadOperation";
import { CompositeReadPartial } from "../ast/operations/composite/CompositeReadPartial";
import type { Operation } from "../ast/operations/operations";
import type { EntitySelection } from "../ast/selection/EntitySelection";
import { FulltextSelection } from "../ast/selection/FulltextSelection";
import { NodeSelection } from "../ast/selection/NodeSelection";
import { RelationshipSelection } from "../ast/selection/RelationshipSelection";
import { getConcreteEntitiesInOnArgumentOfWhere } from "../utils/get-concrete-entities-in-on-argument-of-where";
import { getConcreteWhere } from "../utils/get-concrete-where";
import { isConcreteEntity } from "../utils/is-concrete-entity";
import { isInterfaceEntity } from "../utils/is-interface-entity";
import { isUnionEntity } from "../utils/is-union-entity";
import type { AuthorizationFactory } from "./AuthorizationFactory";
import type { FieldFactory } from "./FieldFactory";
import type { FilterFactory } from "./FilterFactory";
import type { QueryASTFactory } from "./QueryASTFactory";
import type { SortAndPaginationFactory } from "./SortAndPaginationFactory";
import { findFieldsByNameInFieldsByTypeNameField } from "./parsers/find-fields-by-name-in-fields-by-type-name-field";
import { getFieldsByTypeName } from "./parsers/get-fields-by-type-name";
import { parseTopLevelOperationField } from "./parsers/parse-operation-fields";
import { parseSelectionSetField } from "./parsers/parse-selection-set-fields";
import { DeleteOperation } from "../ast/operations/DeleteOperation";
import { UpdateOperation } from "../ast/operations/UpdateOperation";
import { CypherOperation } from "../ast/operations/CypherOperation";
import { CustomCypherSelection } from "../ast/selection/CustomCypherSelection";
import { CompositeCypherOperation } from "../ast/operations/composite/CompositeCypherOperation";
import { TypenameFilter } from "../ast/filters/property-filters/TypenameFilter";
import { AttributeAdapter } from "../../../schema-model/attribute/model-adapters/AttributeAdapter";
import { CypherScalarOperation } from "../ast/operations/CypherScalarOperation";

const TOP_LEVEL_NODE_NAME = "this";

export class OperationsFactory {
    private filterFactory: FilterFactory;
    private fieldFactory: FieldFactory;
    private sortAndPaginationFactory: SortAndPaginationFactory;
    private authorizationFactory: AuthorizationFactory;
    private experimental: boolean;

    constructor(queryASTFactory: QueryASTFactory) {
        this.filterFactory = queryASTFactory.filterFactory;
        this.fieldFactory = queryASTFactory.fieldFactory;
        this.sortAndPaginationFactory = queryASTFactory.sortAndPaginationFactory;
        this.authorizationFactory = queryASTFactory.authorizationFactory;
        this.experimental = queryASTFactory.experimental;
    }

    public createTopLevelOperation({
        entity,
        resolveTree,
        context,
        varName,
    }: {
        entity?: EntityAdapter;
        resolveTree: ResolveTree;
        context: Neo4jGraphQLTranslationContext;
        varName?: string;
    }): Operation {
        const operationMatch = parseTopLevelOperationField(resolveTree.name, context.schemaModel, entity);
        if (!entity && operationMatch.isCustomCypher) {
            return this.createCustomCypherOperation({ entity, resolveTree, context, varName });
        }
        // entity could be undefined only in case of custom fields.
        if (!entity) {
            throw new Error("Transpilation error: Entity for custom cypher operation not found");
        }

        if (isConcreteEntity(entity)) {
            // Handles deprecated top level fulltext
            if (context.resolveTree.args.phrase) {
                if (!context.fulltext) {
                    throw new Error("Failed to get context fulltext");
                }
                const indexName = context.fulltext.indexName || context.fulltext.name;
                if (indexName === undefined) {
                    throw new Error("The name of the fulltext index should be defined using the indexName argument.");
                }

                const op = this.createFulltextOperation(entity, resolveTree, context);
                op.nodeAlias = TOP_LEVEL_NODE_NAME;
                return op;
            }

            if (operationMatch.isCreate) {
                return this.createCreateOperation(entity, resolveTree, context);
            } else if (operationMatch.isUpdate) {
                const op = this.createUpdateOperation(entity, resolveTree, context);
                op.nodeAlias = TOP_LEVEL_NODE_NAME;
                return op;
            } else if (operationMatch.isCustomCypher) {
                const op = this.createCustomCypherOperation({ entity, resolveTree, context, varName });
                op.nodeAlias = TOP_LEVEL_NODE_NAME;
                return op;
            } else if (operationMatch.isDelete) {
                return this.createTopLevelDeleteOperation({
                    entity,
                    resolveTree,
                    context,
                    varName,
                });
            } else if (operationMatch.isRead) {
                let op: ReadOperation;
                if (context.resolveTree.args.fulltext || context.resolveTree.args.phrase) {
                    op = this.createFulltextOperation(entity, resolveTree, context);
                } else {
                    op = this.createReadOperation({
                        entityOrRel: entity,
                        resolveTree,
                        context,
                        varName,
                    }) as ReadOperation;
                }
                op.nodeAlias = TOP_LEVEL_NODE_NAME;
                return op;
            } else if (operationMatch.isConnection) {
                const topLevelConnectionResolveTree = this.normalizeResolveTreeForTopLevelConnection(resolveTree);
                const op = this.createConnectionOperationAST({
                    target: entity,
                    resolveTree: topLevelConnectionResolveTree,
                    context,
                });
                op.nodeAlias = TOP_LEVEL_NODE_NAME;
                return op;
            } else if (operationMatch.isAggregation) {
                const op = this.createAggregationOperation(entity, resolveTree, context);
                op.nodeAlias = TOP_LEVEL_NODE_NAME;
                return op;
            }
            throw new Error(`Operation: ${resolveTree.name} is not yet supported by the QueryAST`);
        }

        if (isInterfaceEntity(entity)) {
            if (operationMatch.isAggregation) {
                const op = this.createAggregationOperation(entity, resolveTree, context);
                op.nodeAlias = TOP_LEVEL_NODE_NAME;
                return op;
            }
            if (operationMatch.isCustomCypher) {
                const op = this.createCustomCypherOperation({ entity, resolveTree, context, varName });
                op.nodeAlias = TOP_LEVEL_NODE_NAME;
                return op;
            }
        }

        if (isUnionEntity(entity)) {
            if (operationMatch.isCustomCypher) {
                const op = this.createCustomCypherOperation({ entity, resolveTree, context, varName });
                op.nodeAlias = TOP_LEVEL_NODE_NAME;
                return op;
            }
        }
        return this.createReadOperation({ entityOrRel: entity, resolveTree, context });
    }

    public createFulltextOperation(
        entity: ConcreteEntityAdapter,
        resolveTree: ResolveTree,
        context: Neo4jGraphQLTranslationContext
    ): FulltextOperation {
        let resolveTreeWhere: Record<string, any> = isObject(resolveTree.args.where) ? resolveTree.args.where : {};
        let sortOptions: Record<string, any> = (resolveTree.args.options as Record<string, any>) || {};
        let fieldsByTypeName = resolveTree.fieldsByTypeName;
        let resolverArgs = resolveTree.args;
        const fulltextOptions = this.getFulltextOptions(context);
        let scoreField: FulltextScoreField | undefined;
        let scoreFilter: FulltextScoreFilter | undefined;

        // Compatibility of top level operations
        const fulltextOperationDeprecatedFields =
            resolveTree.fieldsByTypeName[entity.operations.fulltextTypeNames.result];

        if (fulltextOperationDeprecatedFields) {
            const scoreWhere = resolveTreeWhere.score;
            resolveTreeWhere = resolveTreeWhere[entity.singular] || {};

            const scoreRawField = fulltextOperationDeprecatedFields.score;

            const nestedResolveTree: Record<string, any> = fulltextOperationDeprecatedFields[entity.singular] || {};
            resolverArgs = { ...(nestedResolveTree?.args || {}), ...resolveTree.args };

            sortOptions = {
                limit: sortOptions.limit,
                offset: sortOptions.offset,
                sort: filterTruthy((sortOptions.sort || []).map((field) => field[entity.singular] || field)),
            };
            fieldsByTypeName = nestedResolveTree.fieldsByTypeName || {};
            if (scoreRawField) {
                scoreField = this.createFulltextScoreField(scoreRawField, fulltextOptions.score);
            }
            if (scoreWhere) {
                scoreFilter = new FulltextScoreFilter({
                    scoreVariable: fulltextOptions.score,
                    min: scoreWhere.min,
                    max: scoreWhere.max,
                });
            }
        }

        checkEntityAuthentication({
            entity: entity.entity,
            targetOperations: ["READ"],
            context,
        });

        const selection = new FulltextSelection({
            target: entity,
            fulltext: fulltextOptions,
            scoreVariable: fulltextOptions.score,
        });
        const operation = new FulltextOperation({
            target: entity,
            directed: Boolean(resolverArgs.directed ?? true),
            scoreField,
            selection,
        });

        if (scoreFilter) {
            operation.addFilters(scoreFilter);
        }

        this.hydrateOperation({
            operation,
            entity,
            fieldsByTypeName: fieldsByTypeName,
            context,
            whereArgs: resolveTreeWhere,
        });

        // Override sort to support score
        const sortOptions2 = this.getOptions(entity, sortOptions);

        if (sortOptions2) {
            const sort = this.sortAndPaginationFactory.createSortFields(sortOptions2, entity, fulltextOptions.score);
            operation.addSort(...sort);

            const pagination = this.sortAndPaginationFactory.createPagination(sortOptions2);
            if (pagination) {
                operation.addPagination(pagination);
            }
        }

        return operation;
    }

    public createReadOperation({
        entityOrRel,
        resolveTree,
        context,
        varName,
    }: {
        entityOrRel: EntityAdapter | RelationshipAdapter;
        resolveTree: ResolveTree;
        context: Neo4jGraphQLTranslationContext;
        varName?: string;
    }): ReadOperation | CompositeReadOperation {
        const entity = entityOrRel instanceof RelationshipAdapter ? entityOrRel.target : entityOrRel;
        const relationship = entityOrRel instanceof RelationshipAdapter ? entityOrRel : undefined;
        const resolveTreeWhere: Record<string, any> = isObject(resolveTree.args.where) ? resolveTree.args.where : {};

        if (isConcreteEntity(entity)) {
            checkEntityAuthentication({
                entity: entity.entity,
                targetOperations: ["READ"],
                context,
            });

            let selection: EntitySelection;
            if (relationship) {
                selection = new RelationshipSelection({
                    relationship,
                    directed: Boolean(resolveTree.args?.directed ?? true),
                });
            } else {
                selection = new NodeSelection({
                    target: entity,
                    alias: varName,
                });
            }

            const operation = new ReadOperation({
                target: entity,
                relationship,
                directed: Boolean(resolveTree.args?.directed ?? true),
                selection,
            });

            return this.hydrateReadOperation({
                operation,
                entity,
                resolveTree,
                context,
                whereArgs: resolveTreeWhere,
            });
        } else {
            // if typename is allowed and therefore _on is disabled we can compute only the shared filter without recomputing the filters for each concrete entity
            // if typename filters are allowed we are getting rid of the _on and the implicit typename filter.
            const typenameFilterAllowed = this.experimental && isInterfaceEntity(entity);

            const concreteEntities = typenameFilterAllowed
                ? entity.concreteEntities
                : getConcreteEntitiesInOnArgumentOfWhere(entity, resolveTreeWhere);

            const sharedFilters = typenameFilterAllowed
                ? this.filterFactory.createNodeFilters(entity, resolveTreeWhere)
                : undefined;

            const concreteReadOperations = concreteEntities.map((concreteEntity: ConcreteEntityAdapter) => {
                // Duplicate from normal read
                let selection: EntitySelection;
                if (relationship) {
                    selection = new RelationshipSelection({
                        relationship,
                        directed: Boolean(resolveTree.args?.directed ?? true),
                        targetOverride: concreteEntity,
                    });
                } else {
                    selection = new NodeSelection({
                        target: concreteEntity,
                        alias: varName,
                    });
                }

                const readPartial = new CompositeReadPartial({
                    target: concreteEntity,
                    relationship,
                    directed: Boolean(resolveTree.args?.directed ?? true),
                    selection,
                });

                const whereArgs = getConcreteWhere(entity, concreteEntity, resolveTreeWhere);

                return this.hydrateReadOperation({
                    operation: readPartial,
                    entity: concreteEntity,
                    resolveTree,
                    context,
                    whereArgs: whereArgs,
                    sharedFilters,
                });
            });

            const compositeReadOp = new CompositeReadOperation({
                compositeEntity: entity,
                children: concreteReadOperations,
                relationship,
            });
            this.hydrateCompositeReadOperationWithPagination(entity, compositeReadOp, resolveTree);
            return compositeReadOp;
        }
    }

    // TODO: dupe from read operation
    public createAggregationOperation(
        entityOrRel: ConcreteEntityAdapter | RelationshipAdapter | InterfaceEntityAdapter,
        resolveTree: ResolveTree,
        context: Neo4jGraphQLTranslationContext
    ): AggregationOperation | CompositeAggregationOperation {
        let entity: ConcreteEntityAdapter | InterfaceEntityAdapter;
        if (entityOrRel instanceof RelationshipAdapter) {
            entity = entityOrRel.target as ConcreteEntityAdapter;
        } else {
            entity = entityOrRel;
        }

        const resolveTreeWhere = (resolveTree.args.where || {}) as Record<string, unknown>;

        if (entityOrRel instanceof RelationshipAdapter) {
            if (isConcreteEntity(entity)) {
                checkEntityAuthentication({
                    entity: entity.entity,
                    targetOperations: ["AGGREGATE"],
                    context,
                });

                const selection = new RelationshipSelection({
                    relationship: entityOrRel,
                    directed: Boolean(resolveTree.args?.directed ?? true),
                });

                const operation = new AggregationOperation({
                    entity: entityOrRel,
                    directed: Boolean(resolveTree.args?.directed ?? true),
                    selection,
                });

                return this.hydrateAggregationOperation({
                    relationship: entityOrRel,
                    operation,
                    entity,
                    resolveTree,
                    context,
                    whereArgs: resolveTreeWhere,
                });
            } else {
                const concreteEntities = getConcreteEntitiesInOnArgumentOfWhere(entity, resolveTreeWhere);

                const concreteAggregationOperations = concreteEntities.map((concreteEntity: ConcreteEntityAdapter) => {
                    const aggregationPartial = new CompositeAggregationPartial({
                        target: concreteEntity,
                        entity: entityOrRel,
                        directed: Boolean(resolveTree.args?.directed ?? true),
                    });

                    return aggregationPartial;
                });

                const compositeAggregationOp = new CompositeAggregationOperation({
                    compositeEntity: entity,
                    children: concreteAggregationOperations,
                });

                this.hydrateAggregationOperation({
                    relationship: entityOrRel,
                    entity,
                    resolveTree,
                    context,
                    operation: compositeAggregationOp,
                    whereArgs: resolveTreeWhere,
                });

                return compositeAggregationOp;
            }
        } else {
            if (isConcreteEntity(entity)) {
                let selection: EntitySelection;
                if (context.resolveTree.args.fulltext || context.resolveTree.args.phrase) {
                    const fulltextOptions = this.getFulltextOptions(context);
                    selection = new FulltextSelection({
                        target: entity,
                        fulltext: fulltextOptions,
                        scoreVariable: fulltextOptions.score,
                    });
                } else {
                    selection = new NodeSelection({
                        target: entity,
                        alias: "this",
                    });
                }

                const operation = new AggregationOperation({
                    entity,
                    directed: Boolean(resolveTree.args?.directed ?? true),
                    selection,
                });
                //TODO: use a hydrate method here
                const rawProjectionFields = {
                    ...resolveTree.fieldsByTypeName[entity.operations.getAggregationFieldTypename()],
                };

                const parsedProjectionFields = this.splitConnectionFields(rawProjectionFields);
                const projectionFields = parsedProjectionFields.fields;
                const fields = this.fieldFactory.createAggregationFields(entity, projectionFields);

                operation.setFields(fields);

                const whereArgs = (resolveTree.args.where || {}) as Record<string, unknown>;
                const authFilters = this.authorizationFactory.getAuthFilters({
                    entity,
                    operations: ["AGGREGATE"],
                    attributes: this.getSelectedAttributes(entity, projectionFields),
                    context,
                });

                const filters = this.filterFactory.createNodeFilters(entity, whereArgs); // Aggregation filters only apply to target node

                operation.addFilters(...filters);
                operation.addAuthFilters(...authFilters);

                // TODO: Duplicate logic with hydrateReadOperationWithPagination, check if it's correct to unify.
                const options = this.getOptions(entity, (resolveTree.args.options ?? {}) as any);
                if (options) {
                    const sort = this.sortAndPaginationFactory.createSortFields(options, entity);
                    operation.addSort(...sort);

                    const pagination = this.sortAndPaginationFactory.createPagination(options);
                    if (pagination) {
                        operation.addPagination(pagination);
                    }
                }

                return operation;
            } else {
                // TOP level interface
                const concreteEntities = getConcreteEntitiesInOnArgumentOfWhere(entity, resolveTreeWhere);

                const concreteAggregationOperations = concreteEntities.map((concreteEntity: ConcreteEntityAdapter) => {
                    const aggregationPartial = new CompositeAggregationPartial({
                        target: concreteEntity,
                        directed: Boolean(resolveTree.args?.directed ?? true),
                    });

                    return aggregationPartial;
                });

                const compositeAggregationOp = new CompositeAggregationOperation({
                    compositeEntity: entity,
                    children: concreteAggregationOperations,
                });

                this.hydrateAggregationOperation({
                    entity,
                    resolveTree,
                    context,
                    operation: compositeAggregationOp,
                    whereArgs: resolveTreeWhere,
                });

                return compositeAggregationOp;
            }
        }
    }

    public createCompositeConnectionOperationAST({
        relationship,
        target,
        resolveTree,
        context,
    }: {
        relationship?: RelationshipAdapter;
        target: InterfaceEntityAdapter | UnionEntityAdapter;
        resolveTree: ResolveTree;
        context: Neo4jGraphQLTranslationContext;
    }): CompositeConnectionReadOperation {
        if (!relationship) {
            throw new Error("Top-Level Connection are currently supported only for concrete entities");
        }
        const directed = Boolean(resolveTree.args.directed) ?? true;
        const resolveTreeWhere: Record<string, any> = isObject(resolveTree.args.where) ? resolveTree.args.where : {};

        let nodeWhere: Record<string, any>;
        if (isInterfaceEntity(target)) {
            nodeWhere = isObject(resolveTreeWhere) ? resolveTreeWhere.node : {};
        } else {
            nodeWhere = resolveTreeWhere;
        }

        const concreteEntities = getConcreteEntitiesInOnArgumentOfWhere(target, nodeWhere);
        const concreteConnectionOperations = concreteEntities.map((concreteEntity: ConcreteEntityAdapter) => {
            const selection = new RelationshipSelection({
                relationship,
                directed,
                targetOverride: concreteEntity,
            });

            const connectionPartial = new CompositeConnectionPartial({
                relationship,
                directed,
                target: concreteEntity,
                selection,
            });

            return this.hydrateConnectionOperationAST({
                relationship,
                target: concreteEntity,
                resolveTree,
                context,
                operation: connectionPartial,
                whereArgs: resolveTreeWhere,
            });
        });

        const compositeConnectionOp = new CompositeConnectionReadOperation(concreteConnectionOperations);

        // These sort fields will be duplicated on nested "CompositeConnectionPartial"
        this.hydrateConnectionOperationsASTWithSort({
            entityOrRel: relationship,
            resolveTree,
            operation: compositeConnectionOp,
        });
        return compositeConnectionOp;
    }

    public createConnectionOperationAST({
        relationship,
        target,
        resolveTree,
        context,
    }: {
        relationship?: RelationshipAdapter;
        target: ConcreteEntityAdapter;
        resolveTree: ResolveTree;
        context: Neo4jGraphQLTranslationContext;
    }): ConnectionReadOperation {
        const directed = Boolean(resolveTree.args.directed) ?? true;
        const resolveTreeWhere: Record<string, any> = isObject(resolveTree.args.where) ? resolveTree.args.where : {};
        checkEntityAuthentication({
            entity: target.entity,
            targetOperations: ["READ"],
            context,
        });

        let selection: EntitySelection;
        if (relationship) {
            selection = new RelationshipSelection({
                relationship,
                directed: Boolean(resolveTree.args?.directed ?? true),
            });
        } else {
            selection = new NodeSelection({
                target,
            });
        }
        const operation = new ConnectionReadOperation({ relationship, directed, target, selection });

        return this.hydrateConnectionOperationAST({
            relationship: relationship,
            target: target,
            resolveTree,
            context,
            operation,
            whereArgs: resolveTreeWhere,
        });
    }

    // The current top-level Connection API is inconsistent with the rest of the API making the parsing more complex than it should be.
    // This function temporary adjust some inconsistencies waiting for the new API.
    // TODO: Remove it when the new API is ready.
    private normalizeResolveTreeForTopLevelConnection(resolveTree: ResolveTree): ResolveTree {
        const topLevelConnectionResolveTree = Object.assign({}, resolveTree);
        // Move the sort arguments inside a "node" object.
        if (topLevelConnectionResolveTree.args.sort) {
            topLevelConnectionResolveTree.args.sort = (resolveTree.args.sort as any[]).map((sortField) => {
                return { node: sortField };
            });
        }
        // move the where arguments inside a "node" object.
        if (topLevelConnectionResolveTree.args.where) {
            topLevelConnectionResolveTree.args.where = { node: resolveTree.args.where };
        }
        return topLevelConnectionResolveTree;
    }

    private parseDeleteArgs(
        args: Record<string, any>,
        isTopLevel: boolean
    ): {
        whereArg: { node: Record<string, any>; edge: Record<string, any> };
        deleteArg: Record<string, any>;
    } {
        let whereArg;
        const rawWhere = isRecord(args.where) ? args.where : {};
        if (isTopLevel) {
            whereArg = { node: rawWhere.node ?? {}, edge: rawWhere.edge ?? {} };
        } else {
            whereArg = { node: rawWhere, edge: {} };
        }
        const deleteArg = isRecord(args.delete) ? args.delete : {};
        return { whereArg, deleteArg };
    }

    private createTopLevelDeleteOperation({
        entity,
        resolveTree,
        context,
        varName,
    }: {
        entity: ConcreteEntityAdapter;
        resolveTree: Record<string, any>;
        context: Neo4jGraphQLTranslationContext;
        varName?: string;
    }): DeleteOperation {
        checkEntityAuthentication({
            entity: entity.entity,
            targetOperations: ["DELETE"],
            context,
        });
        const { whereArg, deleteArg } = this.parseDeleteArgs(resolveTree.args, false);
        const selection = new NodeSelection({
            target: entity,
            alias: varName,
        });
        const nodeFilters = this.filterFactory.createNodeFilters(entity, whereArg.node);
        const authFilters = this.authorizationFactory.getAuthFilters({
            entity,
            operations: ["DELETE"],
            context,
        });
        const nestedDeleteOperations = this.createNestedDeleteOperations(deleteArg, entity, context);
        return new DeleteOperation({
            target: entity,
            selection,
            filters: nodeFilters,
            authFilters,
            nestedOperations: nestedDeleteOperations,
        });
    }

    private createNestedDeleteOperationsForInterface({
        deleteArg,
        relationship,
        target,
        context,
    }: {
        deleteArg: Record<string, any>;
        relationship: RelationshipAdapter;
        target: InterfaceEntityAdapter;
        context: Neo4jGraphQLTranslationContext;
    }): DeleteOperation[] {
        const { whereArg } = this.parseDeleteArgs(deleteArg, true);
        // TODO: Remove branch condition with the 5.0 release
        const sharedFilters = this.experimental
            ? this.filterFactory.createNodeFilters(target, whereArg.node)
            : undefined;
        const concreteEntities = this.experimental
            ? target.concreteEntities
            : getConcreteEntitiesInOnArgumentOfWhere(target, whereArg.node);
        return concreteEntities.flatMap((concreteEntity) => {
            return this.createNestedDeleteOperation({
                relationship,
                target: concreteEntity,
                args: deleteArg,
                context,
                sharedFilters,
            });
        });
    }

    private createNestedDeleteOperationsForUnion({
        deleteArg,
        relationship,
        target,
        context,
    }: {
        deleteArg: Record<string, any>;
        relationship: RelationshipAdapter;
        target: UnionEntityAdapter;
        context: Neo4jGraphQLTranslationContext;
    }): DeleteOperation[] {
        const concreteEntities = getConcreteEntitiesInOnArgumentOfWhere(target, deleteArg);

        return concreteEntities.flatMap((concreteEntity) => {
            return asArray(deleteArg[concreteEntity.name] ?? {}).flatMap((concreteArgs) => {
                return this.createNestedDeleteOperation({
                    relationship,
                    target: concreteEntity,
                    args: concreteArgs,
                    context,
                });
            });
        });
    }

    private createNestedDeleteOperations(
        deleteArg: Record<string, any>,
        source: ConcreteEntityAdapter,
        context: Neo4jGraphQLTranslationContext
    ): DeleteOperation[] {
        return filterTruthy(
            Object.entries(deleteArg).flatMap(([key, valueArr]) => {
                return asArray(valueArr).flatMap((value) => {
                    if (key === "_on") {
                        const concreteDeleteArg = value[source.name];
                        if (!concreteDeleteArg) {
                            return;
                        }

                        return asArray(concreteDeleteArg).flatMap((v) => {
                            return this.createNestedDeleteOperations(v, source, context);
                        });
                    }
                    const relationship = source.findRelationship(key);
                    if (!relationship) {
                        throw new Error(`Failed to find relationship ${key}`);
                    }
                    const target = relationship.target;
                    if (isInterfaceEntity(target)) {
                        return this.createNestedDeleteOperationsForInterface({
                            deleteArg: value,
                            relationship,
                            target,
                            context,
                        });
                    }
                    if (isUnionEntity(target)) {
                        return this.createNestedDeleteOperationsForUnion({
                            deleteArg: value,
                            relationship,
                            target,
                            context,
                        });
                    }

                    return this.createNestedDeleteOperation({
                        relationship,
                        target,
                        args: value,
                        context,
                    });
                });
            })
        );
    }

    private createNestedDeleteOperation({
        relationship,
        target,
        args,
        context,
        sharedFilters,
    }: {
        relationship: RelationshipAdapter;
        target: ConcreteEntityAdapter;
        args: Record<string, any>;
        context: Neo4jGraphQLTranslationContext;
        sharedFilters?: Filter[];
    }): DeleteOperation[] {
        const { whereArg, deleteArg } = this.parseDeleteArgs(args, true);

        checkEntityAuthentication({
            entity: target.entity,
            targetOperations: ["DELETE"],
            context,
        });

        const selection = new RelationshipSelection({
            relationship,
            directed: true,
            optional: true,
            targetOverride: target,
        });
        const nodeFilters = sharedFilters ?? this.filterFactory.createNodeFilters(target, whereArg.node);
        const edgeFilters = this.filterFactory.createEdgeFilters(relationship, whereArg.edge);

        const filters = [...nodeFilters, ...edgeFilters];

        const authFilters = this.authorizationFactory.getAuthFilters({
            entity: target,
            operations: ["DELETE"],
            context,
        });

        const nestedDeleteOperations = this.createNestedDeleteOperations(deleteArg, target, context);
        return [
            new DeleteOperation({
                target,
                selection,
                filters,
                authFilters,
                nestedOperations: nestedDeleteOperations,
            }),
        ];
    }

    private createCreateOperation(
        entity: ConcreteEntityAdapter,
        resolveTree: ResolveTree,
        context: Neo4jGraphQLTranslationContext
    ): CreateOperation {
        const responseFields = Object.values(
            resolveTree.fieldsByTypeName[entity.operations.mutationResponseTypeNames.create] ?? {}
        );
        const createOP = new CreateOperation({ target: entity });
        const projectionFields = responseFields
            .filter((f) => f.name === entity.plural)
            .map((field) => {
                const readOP = this.createReadOperation({
                    entityOrRel: entity,
                    resolveTree: field,
                    context,
                }) as ReadOperation;
                return readOP;
            });

        createOP.addProjectionOperations(projectionFields);
        return createOP;
    }

    private createUpdateOperation(
        entity: ConcreteEntityAdapter,
        resolveTree: ResolveTree,
        context: Neo4jGraphQLTranslationContext
    ): UpdateOperation {
        const responseFields = Object.values(
            resolveTree.fieldsByTypeName[entity.operations.mutationResponseTypeNames.update] ?? {}
        );
        const updateOp = new UpdateOperation({ target: entity });
        const projectionFields = responseFields
            .filter((f) => f.name === entity.plural)
            .map((field) => {
                const readOP = this.createReadOperation({
                    entityOrRel: entity,
                    resolveTree: field,
                    context,
                }) as ReadOperation;
                return readOP;
            });

        updateOp.addProjectionOperations(projectionFields);
        return updateOp;
    }

    private createCustomCypherOperation({
        resolveTree,
        context,
        entity,
        varName,
    }: {
        resolveTree: ResolveTree;
        context: Neo4jGraphQLTranslationContext;
        entity?: EntityAdapter;
        varName?: string;
    }): CypherOperation | CompositeCypherOperation | CypherScalarOperation {
        const operationAttribute =
            context.schemaModel.operations.Query?.findAttribute(resolveTree.name) ??
            context.schemaModel.operations.Mutation?.findAttribute(resolveTree.name);

        if (!operationAttribute) {
            throw new Error(`Failed to collect information about the operation field with name: ${resolveTree.name}`);
        }
        const operationField = new AttributeAdapter(operationAttribute);
        if (!entity) {
            const selection = new CustomCypherSelection({
                operationField,
                target: entity,
                alias: varName,
                rawArguments: resolveTree.args,
            });
            return new CypherScalarOperation(selection);
        }
        if (isConcreteEntity(entity)) {
            const selection = new CustomCypherSelection({
                operationField,
                target: entity,
                alias: varName,
                rawArguments: resolveTree.args,
            });
            const customCypher = new CypherOperation({ target: entity, selection });
            return this.hydrateReadOperation({ entity, operation: customCypher, resolveTree, context, whereArgs: {} });
        }
        const selection = new CustomCypherSelection({
            operationField,
            target: entity,
            alias: varName,
            rawArguments: resolveTree.args,
        });

        const CypherReadPartials = entity.concreteEntities.map((concreteEntity) => {
            const partialSelection = new NodeSelection({ target: concreteEntity, useContextTarget: true });
            const partial = new CompositeReadPartial({ target: concreteEntity, selection: partialSelection });
            // The Typename filter here is required to access concrete entities from a Cypher Union selection.
            // It would be probably more ergonomic to pass the label filter with the selection,
            // although is currently not possible to do so with Cypher.Builder
            partial.addFilters(new TypenameFilter([concreteEntity]));
            return this.hydrateReadOperation({
                entity: concreteEntity,
                operation: partial,
                resolveTree,
                context,
                whereArgs: {},
            });
        });
        return new CompositeCypherOperation({ selection, partials: CypherReadPartials });
    }

    private getFulltextOptions(context: Neo4jGraphQLTranslationContext): FulltextOptions {
        if (context.fulltext) {
            const indexName = context.fulltext.indexName || context.fulltext.name;
            if (indexName === undefined) {
                throw new Error("The name of the fulltext index should be defined using the indexName argument.");
            }
            const phrase = context.resolveTree.args.phrase;
            if (!phrase || typeof phrase !== "string") {
                throw new Error("Invalid phrase");
            }

            return {
                index: indexName,
                phrase,
                score: context.fulltext.scoreVariable,
            };
        }

        const entries = Object.entries(context.resolveTree.args.fulltext || {});
        if (entries.length > 1) {
            throw new Error("Can only call one search at any given time");
        }
        const [indexName, indexInput] = entries[0] as [string, { phrase: string }];
        return {
            index: indexName,
            phrase: indexInput.phrase,
            score: new Cypher.Variable(),
        };
    }

    private createFulltextScoreField(field: ResolveTree, scoreVar: Cypher.Variable): FulltextScoreField {
        return new FulltextScoreField({
            alias: field.alias,
            score: scoreVar,
        });
    }

    // eslint-disable-next-line @typescript-eslint/comma-dangle
    private hydrateConnectionOperationsASTWithSort<
        T extends ConnectionReadOperation | CompositeConnectionReadOperation
    >({
        entityOrRel,
        resolveTree,
        operation,
    }: {
        entityOrRel: ConcreteEntityAdapter | RelationshipAdapter;
        resolveTree: ResolveTree;
        operation: T;
    }): T {
        let options: Pick<ConnectionQueryArgs, "first" | "after" | "sort"> | undefined;
        const target = isConcreteEntity(entityOrRel) ? entityOrRel : entityOrRel.target;
        if (!isUnionEntity(target)) {
            options = this.getConnectionOptions(target, resolveTree.args);
        } else {
            options = resolveTree.args;
        }
        const first = options?.first;
        const sort = options?.sort;

        const afterArg = options?.after;
        const offset = isString(afterArg) ? cursorToOffset(afterArg) + 1 : undefined;

        if (first || offset) {
            const pagination = this.sortAndPaginationFactory.createPagination({
                limit: first,
                offset,
            });
            if (pagination) {
                operation.addPagination(pagination);
            }
        }

        if (sort) {
            sort.forEach((options) => {
                const sort = this.sortAndPaginationFactory.createConnectionSortFields(options, entityOrRel);
                operation.addSort(sort);
            });
        }

        return operation;
    }

    private hydrateConnectionOperationAST<T extends ConnectionReadOperation>({
        relationship,
        target,
        resolveTree,
        context,
        operation,
        whereArgs,
    }: {
        relationship?: RelationshipAdapter;
        target: ConcreteEntityAdapter;
        resolveTree: ResolveTree;
        context: Neo4jGraphQLTranslationContext;
        operation: T;
        whereArgs: Record<string, any>;
    }): T {
        // hydrate hydrateConnectionOperationAST is used for both top-level and nested connections.
        // If the relationship is defined use the RelationshipAdapter to infer the typeNames, if not use the target.
        const entityOrRel = relationship ?? target;
        const resolveTreeConnectionFields = {
            ...resolveTree.fieldsByTypeName[entityOrRel.operations.connectionFieldTypename],
        };

        const edgeFieldsRaw = findFieldsByNameInFieldsByTypeNameField(resolveTreeConnectionFields, "edges");
        const resolveTreeEdgeFields = getFieldsByTypeName(
            edgeFieldsRaw,
            entityOrRel.operations.relationshipFieldTypename
        );

        const nodeFieldsRaw = findFieldsByNameInFieldsByTypeNameField(resolveTreeEdgeFields, "node");

        this.hydrateConnectionOperationsASTWithSort({
            entityOrRel,
            resolveTree,
            operation,
        });
        const isTopLevel = !relationship;
        const resolveTreeNodeFieldsTypesNames = isTopLevel ? [target.name] : [target.name, relationship.target.name];

        const resolveTreeNodeFields = getFieldsByTypeName(nodeFieldsRaw, resolveTreeNodeFieldsTypesNames);
        const nodeFields = this.fieldFactory.createFields(target, resolveTreeNodeFields, context);
        const edgeFields = isTopLevel
            ? []
            : this.fieldFactory.createFields(relationship, resolveTreeEdgeFields, context);

        const authFilters = this.authorizationFactory.getAuthFilters({
            entity: target,
            operations: ["READ"],
            attributes: this.getSelectedAttributes(target, resolveTreeNodeFields),
            context,
        });
        const filters = this.filterFactory.createConnectionPredicates({
            rel: relationship,
            entity: target,
            where: whereArgs,
        });

        operation.setNodeFields(nodeFields);
        operation.setEdgeFields(edgeFields);
        operation.addFilters(...filters);
        operation.addAuthFilters(...authFilters);

        return operation;
    }

    private splitConnectionFields(rawFields: Record<string, ResolveTree>): {
        node: ResolveTree | undefined;
        edge: ResolveTree | undefined;
        fields: Record<string, ResolveTree>;
    } {
        let nodeField: ResolveTree | undefined;
        let edgeField: ResolveTree | undefined;

        const fields: Record<string, ResolveTree> = {};

        Object.entries(rawFields).forEach(([key, field]) => {
            if (field.name === "node") {
                nodeField = field;
            } else if (field.name === "edge") {
                edgeField = field;
            } else {
                fields[key] = field;
            }
        });

        return {
            node: nodeField,
            edge: edgeField,
            fields,
        };
    }

    private hydrateOperation<T extends ReadOperation>({
        entity,
        operation,
        whereArgs,
        context,
        sortArgs,
        fieldsByTypeName,
        sharedFilters,
    }: {
        entity: ConcreteEntityAdapter;
        operation: T;
        context: Neo4jGraphQLTranslationContext;
        whereArgs: Record<string, any>;
        sortArgs?: Record<string, any>;
        fieldsByTypeName: FieldsByTypeName;
        sharedFilters?: Filter[];
    }): T {
        const concreteProjectionFields = { ...fieldsByTypeName[entity.name] };
        // Get the abstract types of the interface
        const entityInterfaces = entity.compositeEntities;

        const interfacesFields = filterTruthy(entityInterfaces.map((i) => fieldsByTypeName[i.name]));

        const projectionFields = mergeDeep<Record<string, ResolveTree>[]>([
            ...interfacesFields,
            concreteProjectionFields,
        ]);
        const fields = this.fieldFactory.createFields(entity, projectionFields, context);

        const filters = sharedFilters ? sharedFilters : this.filterFactory.createNodeFilters(entity, whereArgs);

        const authFilters = this.authorizationFactory.getAuthFilters({
            entity,
            operations: ["READ"],
            attributes: this.getSelectedAttributes(entity, projectionFields),
            context,
        });

        operation.setFields(fields);
        operation.addFilters(...filters);
        operation.addAuthFilters(...authFilters);

        if (sortArgs) {
            const sortOptions = this.getOptions(entity, sortArgs);

            if (sortOptions) {
                const sort = this.sortAndPaginationFactory.createSortFields(sortOptions, entity);
                operation.addSort(...sort);

                const pagination = this.sortAndPaginationFactory.createPagination(sortOptions);
                if (pagination) {
                    operation.addPagination(pagination);
                }
            }
        }
        return operation;
    }

    private hydrateReadOperation<T extends ReadOperation>({
        entity,
        operation,
        resolveTree,
        context,
        whereArgs,
        sharedFilters,
    }: {
        entity: ConcreteEntityAdapter;
        operation: T;
        resolveTree: ResolveTree;
        context: Neo4jGraphQLTranslationContext;
        whereArgs: Record<string, any> | Filter[];
        sharedFilters?: Filter[];
    }): T {
        return this.hydrateOperation({
            entity,
            operation,
            context,
            whereArgs,
            fieldsByTypeName: resolveTree.fieldsByTypeName,
            sortArgs: (resolveTree.args.options as Record<string, any>) || {},
            sharedFilters,
        });
    }

    private hydrateAggregationOperation<T extends AggregationOperation | CompositeAggregationOperation>({
        relationship,
        entity,
        operation,
        resolveTree,
        context,
        whereArgs,
    }: {
        relationship?: RelationshipAdapter;
        entity: ConcreteEntityAdapter | InterfaceEntityAdapter;
        operation: T;
        resolveTree: ResolveTree;
        context: Neo4jGraphQLTranslationContext;
        whereArgs: Record<string, any>;
    }): T {
        if (relationship) {
            const rawProjectionFields = {
                ...resolveTree.fieldsByTypeName[relationship.operations.getAggregationFieldTypename()],
            };
            const parsedProjectionFields = this.splitConnectionFields(rawProjectionFields);
            const projectionFields = parsedProjectionFields.fields;

            const edgeRawFields = {
                ...parsedProjectionFields.edge?.fieldsByTypeName[
                    relationship.operations.getAggregationFieldTypename("edge")
                ],
            };

            const nodeRawFields = {
                ...parsedProjectionFields.node?.fieldsByTypeName[
                    relationship.operations.getAggregationFieldTypename("node")
                ],
            };

            const fields = this.fieldFactory.createAggregationFields(entity, projectionFields);
            const nodeFields = this.fieldFactory.createAggregationFields(entity, nodeRawFields);
            const edgeFields = this.fieldFactory.createAggregationFields(relationship, edgeRawFields);
            const authFilters = this.authorizationFactory.getAuthFilters({
                entity,
                operations: ["AGGREGATE"],
                context,
            });
            const filters = this.filterFactory.createNodeFilters(entity, whereArgs);

            operation.setFields(fields);
            operation.setNodeFields(nodeFields);
            operation.setEdgeFields(edgeFields);
            operation.addFilters(...filters);
            operation.addAuthFilters(...authFilters);
        } else {
            const rawProjectionFields = {
                ...resolveTree.fieldsByTypeName[entity.operations.aggregateTypeNames.selection],
            };

            const fields = this.fieldFactory.createAggregationFields(entity, rawProjectionFields);
            const authFilters = this.authorizationFactory.getAuthFilters({
                entity,
                operations: ["AGGREGATE"],
                context,
            });
            const filters = this.filterFactory.createNodeFilters(entity, whereArgs); // Aggregation filters only apply to target node
            operation.setFields(fields);
            operation.addFilters(...filters);
            operation.addAuthFilters(...authFilters);
        }

        const options = this.getOptions(entity, (resolveTree.args.options ?? {}) as any);
        if (options) {
            const sort = this.sortAndPaginationFactory.createSortFields(options, entity);
            operation.addSort(...sort);

            const pagination = this.sortAndPaginationFactory.createPagination(options);
            if (pagination) {
                operation.addPagination(pagination);
            }
        }

        return operation;
    }

    private getOptions(entity: EntityAdapter, options?: Record<string, any>): GraphQLOptionsArg | undefined {
        if (!options) {
            return undefined;
        }
        const limitDirective = isUnionEntity(entity) ? undefined : entity.annotations.limit;

        let limit: Integer | number | undefined = options?.limit ?? limitDirective?.default ?? limitDirective?.max;
        if (limit instanceof Integer) {
            limit = limit.toNumber();
        }
        const maxLimit = limitDirective?.max;
        if (limit !== undefined && maxLimit !== undefined) {
            limit = Math.min(limit, maxLimit);
        }

        if (limit === undefined && options.offset === undefined && options.sort === undefined) return undefined;

        return {
            limit,
            offset: options.offset,
            sort: options.sort,
        };
    }

    private getConnectionOptions(
        entity: ConcreteEntityAdapter | InterfaceEntityAdapter,
        options: Record<string, any>
    ): Pick<ConnectionQueryArgs, "first" | "after" | "sort"> | undefined {
        const limitDirective = entity.annotations.limit;

        let limit: Integer | number | undefined = options?.first ?? limitDirective?.default ?? limitDirective?.max;
        if (limit instanceof Integer) {
            limit = limit.toNumber();
        }
        const maxLimit = limitDirective?.max;
        if (limit !== undefined && maxLimit !== undefined) {
            limit = Math.min(limit, maxLimit);
        }

        if (limit === undefined && options.after === undefined && options.sort === undefined) return undefined;

        return {
            first: limit,
            after: options.after,
            sort: options.sort,
        };
    }

    private getSelectedAttributes(
        entity: ConcreteEntityAdapter,
        rawFields: Record<string, ResolveTree>
    ): AttributeAdapter[] {
        return filterTruthy(
            Object.values(rawFields).map((field: ResolveTree) => {
                const { fieldName } = parseSelectionSetField(field.name);
                return entity.findAttribute(fieldName);
            })
        );
    }

    private hydrateCompositeReadOperationWithPagination(
        entity: EntityAdapter,
        operation: CompositeReadOperation | ReadOperation,
        resolveTree: ResolveTree
    ) {
        const options = this.getOptions(entity, (resolveTree.args.options ?? {}) as any);
        if (options) {
            const sort = this.sortAndPaginationFactory.createSortFields(options, entity);
            operation.addSort(...sort);

            const pagination = this.sortAndPaginationFactory.createPagination(options);
            if (pagination) {
                operation.addPagination(pagination);
            }
        }
    }
}
