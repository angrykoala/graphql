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
import { mergeDeep } from "@graphql-tools/utils";
import Cypher from "@neo4j/cypher-builder";
import type { Node } from "../classes";
import type { GraphQLOptionsArg, GraphQLWhereArg, Context, GraphQLSortArg } from "../types";
import { createAuthPredicates } from "./create-auth-and-params";
import { createDatetimeElement } from "./projection/elements/create-datetime-element";
import createPointElement from "./projection/elements/create-point-element";
import mapToDbProperty from "../utils/map-to-db-property";
import { createFieldAggregation } from "./field-aggregations/create-field-aggregation";
import { addGlobalIdField } from "../utils/global-node-projection";
import { getCypherRelationshipDirection } from "../utils/get-relationship-direction";
import { generateMissingOrAliasedFields, filterFieldsInSelection, generateProjectionField } from "./utils/resolveTree";
import { removeDuplicates } from "../utils/utils";
import { createProjectionSubquery } from "./projection/subquery/create-projection-subquery";
import { collectUnionSubqueriesResults } from "./projection/subquery/collect-union-subqueries-results";
import { createConnectionClause } from "./connection-clause/create-connection-clause";
import { translateCypherDirectiveProjection } from "./projection/subquery/translate-cypher-directive-projection";

interface Res {
    projection: Cypher.Expr[];
    params: any;
    meta: ProjectionMeta;
    subqueries: Array<Cypher.Clause>;
    subqueriesBeforeSort: Array<Cypher.Clause>;
}

export interface ProjectionMeta {
    authValidatePredicates?: Cypher.Predicate[];
    cypherSortFields?: string[];
}

export type ProjectionResult = {
    projection: Cypher.Expr;
    params: Record<string, any>;
    meta: ProjectionMeta;
    subqueries: Array<Cypher.Clause>;
    subqueriesBeforeSort: Array<Cypher.Clause>;
};

export default function createProjectionAndParams({
    resolveTree,
    node,
    context,
    varName,
    literalElements,
    resolveType,
    cypherFieldAliasMap
}: {
    resolveTree: ResolveTree;
    node: Node;
    context: Context;
    varName: Cypher.Node | Cypher.Relationship | Cypher.Variable;
    literalElements?: boolean;
    resolveType?: boolean;
    cypherFieldAliasMap: Record<string, Cypher.Node | Cypher.Variable>
}): ProjectionResult {
    function reducer(res: Res, field: ResolveTree): Res {
        const alias = field.alias;
        const param = new Cypher.Node();

        const whereInput = field.args.where as GraphQLWhereArg;
        const optionsInput = (field.args.options || {}) as GraphQLOptionsArg;
        const cypherField = node.cypherFields.find((x) => x.fieldName === field.name);
        const relationField = node.relationFields.find((x) => x.fieldName === field.name);
        const connectionField = node.connectionFields.find((x) => x.fieldName === field.name);
        const pointField = node.pointFields.find((x) => x.fieldName === field.name);
        const temporalField = node.temporalFields.find((x) => x.fieldName === field.name);
        const authableField = node.authableFields.find((x) => x.fieldName === field.name);

        if (authableField) {
            // TODO: move this to translate-top-level
            if (authableField.auth) {
                const allowAndParams = createAuthPredicates({
                    entity: authableField,
                    operations: "READ",
                    context,
                    allow: {
                        parentNode: node,
                        varName: varName as Cypher.Node,
                    },
                });
                if (allowAndParams) {
                    if (!res.meta.authValidatePredicates) {
                        res.meta.authValidatePredicates = [];
                    }
                    res.meta.authValidatePredicates?.push(allowAndParams);
                }
            }
        }

        if (cypherField) {
            return translateCypherDirectiveProjection({
                context,
                cypherField,
                field,
                node,
                alias,
                param,
                nodeRef: varName as Cypher.Node,
                res,
                cypherFieldAliasMap
            });
        }

        if (relationField) {
            const referenceNode = context.nodes.find((x) => x.name === relationField.typeMeta.name);

            if (referenceNode?.queryOptions) {
                optionsInput.limit = referenceNode.queryOptions.getLimit(optionsInput.limit);
            }
            const subqueryReturnAlias = new Cypher.NamedVariable(`var_${alias}_REPLACE_ME`);
            if (relationField.interface || relationField.union) {
                let referenceNodes;
                if (relationField.interface) {
                    const interfaceImplementations = context.nodes.filter((x) =>
                        relationField.interface?.implementations?.includes(x.name)
                    );

                    if (field.args.where) {
                        // Enrich concrete types with shared filters
                        const interfaceSharedFilters = Object.fromEntries(
                            Object.entries(field.args.where).filter(([key]) => key !== "_on")
                        );
                        if (Object.keys(interfaceSharedFilters).length > 0) {
                            field.args.where = getAugmentedImplementationFilters(
                                field.args.where as GraphQLWhereArg,
                                interfaceSharedFilters,
                                interfaceImplementations
                            );
                        } else {
                            field.args.where = { ...(field.args.where["_on"] || {}) };
                        }
                    }

                    referenceNodes = interfaceImplementations.filter(
                        (x) =>
                            // where is not defined
                            !field.args.where ||
                            // where exists but has no filters defined
                            Object.keys(field.args.where).length === 0 ||
                            // where exists and has a filter on this implementation
                            Object.prototype.hasOwnProperty.call(field.args.where, x.name)
                    );
                } else {
                    referenceNodes = context.nodes.filter(
                        (x) =>
                            relationField.union?.nodes?.includes(x.name) &&
                            (!field.args.where || Object.prototype.hasOwnProperty.call(field.args.where, x.name))
                    );
                }

                const parentNode = varName as Cypher.Node;

                const unionSubqueries: Cypher.Clause[] = [];

                for (const refNode of referenceNodes) {
                    const targetNode = new Cypher.Node({ labels: refNode.getLabels(context) });
                    const recurse = createProjectionAndParams({
                        resolveTree: field,
                        node: refNode,
                        context,
                        varName: targetNode,
                        cypherFieldAliasMap
                    });
                    res.params = { ...res.params, ...recurse.params };

                    const direction = getCypherRelationshipDirection(relationField, field.args);

                    const nestedProjection = new Cypher.RawCypher((env) => {
                        const nestedProj = recurse.projection.getCypher(env).replace(/{|}/gm, "").trim();
                        const nestedProjString = nestedProj.length ? `, ${nestedProj}` : "";
                        return `{ __resolveType: "${refNode.name}"${nestedProjString} }`;
                    });

                    const subquery = createProjectionSubquery({
                        parentNode,
                        whereInput: field.args.where ? field.args.where[refNode.name] : {},
                        node: refNode,
                        context,
                        subqueryReturnAlias,
                        nestedProjection,
                        nestedSubqueries: [...recurse.subqueriesBeforeSort, ...recurse.subqueries],
                        targetNode,
                        relationField,
                        relationshipDirection: direction,
                        optionsInput,
                        authValidatePredicates: recurse.meta?.authValidatePredicates,
                        addSkipAndLimit: false,
                        collect: false,
                    });

                    const unionWith = new Cypher.With("*");
                    unionSubqueries.push(Cypher.concat(unionWith, subquery));
                }

                const unionClause = new Cypher.Union(...unionSubqueries);

                const collectAndLimitStatements = collectUnionSubqueriesResults({
                    resultVariable: subqueryReturnAlias,
                    optionsInput,
                    isArray: Boolean(relationField.typeMeta.array),
                });

                const unionAndSort = Cypher.concat(new Cypher.Call(unionClause), collectAndLimitStatements);
                res.subqueries.push(new Cypher.Call(unionAndSort).innerWith(parentNode));
                res.projection.push(new Cypher.RawCypher((env) => `${alias}: ${subqueryReturnAlias.getCypher(env)}`));

                return res;
            }

            // const targetNode = new Cypher.Node({ labels: (referenceNode || node).getLabels(context) });
            const targetNode = referenceNode
                ? new Cypher.Node({
                      labels: referenceNode.getLabels(context),
                  })
                : varName;

            const recurse = createProjectionAndParams({
                resolveTree: field,
                node: referenceNode || node,
                context,
                varName: targetNode,
                cypherFieldAliasMap
            });
            res.params = { ...res.params, ...recurse.params };

            const direction = getCypherRelationshipDirection(relationField, field.args);

            const subquery = createProjectionSubquery({
                parentNode: varName as Cypher.Node,
                whereInput,
                node: referenceNode as Node, // TODO: improve typings
                context,
                subqueryReturnAlias,
                nestedProjection: recurse.projection,
                nestedSubqueries: [...recurse.subqueriesBeforeSort, ...recurse.subqueries],
                targetNode: targetNode as Cypher.Node,
                relationField,
                relationshipDirection: direction,
                optionsInput,
                authValidatePredicates: recurse.meta?.authValidatePredicates,
            });
            res.subqueries.push(new Cypher.Call(subquery).innerWith(varName));
            res.projection.push(new Cypher.RawCypher((env) => `${alias}: ${subqueryReturnAlias.getCypher(env)}`));
            return res;
        }

        const aggregationFieldProjection = createFieldAggregation({
            context,
            nodeVar: varName as Cypher.Node,
            node,
            field,
        });

        if (aggregationFieldProjection) {
            if (aggregationFieldProjection.projectionSubqueryCypher) {
                res.subqueries.push(aggregationFieldProjection.projectionSubqueryCypher);
            }
            res.projection.push(
                new Cypher.RawCypher((env) => `${alias}: ${aggregationFieldProjection.projectionCypher.getCypher(env)}`)
            );
            return res;
        }

        if (connectionField) {
            const connectionClause = new Cypher.Call(
                createConnectionClause({
                    resolveTree: field,
                    field: connectionField,
                    context,
                    nodeVariable: varName as Cypher.Node,
                    returnVariable: param,
                    cypherFieldAliasMap
                })
            ).innerWith(varName);
            // TODO varName it was a String now is a Variable
            // const connection = connectionClause.build(`connection___${matrdn}`); // TODO: remove build from here
            //  const stupidParams = connection.params;

            /*      const connectionSubClause = new Cypher.RawCypher((env) => {
                // TODO: avoid REPLACE_ME in params and return them here

                return [connectionClause.getCypher(env), {}];
            }); */
            res.subqueries.push(connectionClause);
            res.projection.push(new Cypher.RawCypher((env) => `${field.alias}: ${param.getCypher(env)}`));

            // res.params = { ...res.params, ...stupidParams };
            return res;
        }

        if (pointField) {
            res.projection.push(createPointElement({ resolveTree: field, field: pointField, variable: varName }));
        } else if (temporalField?.typeMeta.name === "DateTime") {
            res.projection.push(createDatetimeElement({ resolveTree: field, field: temporalField, variable: varName }));
        } else {
            // In the case of using the @alias directive (map a GraphQL field to a db prop)
            // the output will be RETURN varName {GraphQLfield: varName.dbAlias}
            const dbFieldName = mapToDbProperty(node, field.name);

            // If field is aliased, rename projected field to alias and set to varName.fieldName
            // e.g. RETURN varname { .fieldName } -> RETURN varName { alias: varName.fieldName }

            const fieldProjection = new Cypher.RawCypher((env) => {
                let aliasedProj: string;
                if (alias !== field.name || dbFieldName !== field.name || literalElements) {
                    aliasedProj = `${alias}: ${varName.getCypher(env)}`;
                } else {
                    aliasedProj = "";
                }
                return `${aliasedProj}.${dbFieldName}`;
            });

            res.projection.push(fieldProjection);
        }

        return res;
    }
    let existingProjection = { ...resolveTree.fieldsByTypeName[node.name] };

    if (context.fulltextIndex) {
        return createFulltextProjection({
            resolveTree,
            node,
            context,
            varName: varName as Cypher.Node,
            literalElements,
            resolveType,
            cypherFieldAliasMap
        });
    }

    // If we have a query for a globalNode and it includes the "id" field
    // we modify the projection to include the appropriate db fields

    if (node.isGlobalNode && existingProjection.id) {
        existingProjection = addGlobalIdField(existingProjection, node.getGlobalIdField());
    }

    // Fields of reference node to sort on. Since sorting is done on projection, if field is not selected
    // sort will fail silently

    const sortFieldNames = ((resolveTree.args.options as GraphQLOptionsArg)?.sort ?? []).map(Object.keys).flat();

    // Iterate over fields name in sort argument
    const nodeFields = sortFieldNames.reduce(
        (acc, sortFieldName) => ({
            ...acc,
            // If fieldname is not found in fields of selection set
            ...(!Object.values(existingProjection).find((field) => field.name === sortFieldName)
                ? // generate a basic resolve tree
                  generateProjectionField({ name: sortFieldName })
                : {}),
        }),
        // and add it to existing fields for projection
        existingProjection
    );

    // Include fields of implemented interfaces to allow for fragments on interfaces
    // cf. https://github.com/neo4j/graphql/issues/476
    const mergedSelectedFields: Record<string, ResolveTree> = mergeDeep<Record<string, ResolveTree>[]>([
        nodeFields,
        ...node.interfaces.map((i) => resolveTree.fieldsByTypeName[i.name.value]),
    ]);

    // Merge fields for final projection to account for multiple fragments
    // cf. https://github.com/neo4j/graphql/issues/920
    const mergedFields: Record<string, ResolveTree> = mergeDeep<Record<string, ResolveTree>[]>([
        mergedSelectedFields,
        generateMissingOrAliasedSortFields({ selection: mergedSelectedFields, resolveTree }),
        generateMissingOrAliasedRequiredFields({ selection: mergedSelectedFields, node }),
    ]);

    const { projection, params, meta, subqueries, subqueriesBeforeSort } = Object.values(mergedFields).reduce(reducer, {
        projection: resolveType ? [new Cypher.RawCypher(`__resolveType: "${node.name}"`)] : [],
        params: {},
        meta: {},
        subqueries: [],
        subqueriesBeforeSort: [],
    });
    const projectionCypher = new Cypher.RawCypher((env) => {
        return `{ ${projection.map((proj) => proj.getCypher(env)).join(", ")} }`;
    });
    return {
        projection: projectionCypher,
        params,
        meta,
        subqueries,
        subqueriesBeforeSort,
    };
}

function getSortArgs(resolveTree: ResolveTree): GraphQLSortArg[] {
    const connectionArgs = resolveTree.args.sort as GraphQLSortArg[] | undefined;
    const optionsArgs = (resolveTree.args.options as GraphQLOptionsArg)?.sort;

    return connectionArgs || optionsArgs || [];
}

// Generates any missing fields required for sorting
const generateMissingOrAliasedSortFields = ({
    selection,
    resolveTree,
}: {
    selection: Record<string, ResolveTree>;
    resolveTree: ResolveTree;
}): Record<string, ResolveTree> => {
    const sortArgs = getSortArgs(resolveTree);
    const sortFieldNames = removeDuplicates(sortArgs.map(Object.keys).flat());

    return generateMissingOrAliasedFields({ fieldNames: sortFieldNames, selection });
};

// Generated any missing fields required for custom resolvers
const generateMissingOrAliasedRequiredFields = ({
    node,
    selection,
}: {
    node: Node;
    selection: Record<string, ResolveTree>;
}): Record<string, ResolveTree> => {
    const requiredFields = removeDuplicates(
        filterFieldsInSelection({ fields: node.customResolverFields, selection })
            .map((f) => f.requiredFields)
            .flat()
    );

    return generateMissingOrAliasedFields({ fieldNames: requiredFields, selection });
};

function createFulltextProjection({
    resolveTree,
    node,
    context,
    varName,
    literalElements,
    resolveType,
    cypherFieldAliasMap
}: {
    resolveTree: ResolveTree;
    node: Node;
    context: Context;
    chainStr?: string;
    varName: Cypher.Node;
    literalElements?: boolean;
    resolveType?: boolean;
    cypherFieldAliasMap: Record<string, Cypher.Node | Cypher.Variable>
}): ProjectionResult {
    if (!resolveTree.fieldsByTypeName[node.fulltextTypeNames.result][node.singular]) {
        return {
            projection: new Cypher.Map(),
            params: {},
            meta: {},
            subqueries: [],
            subqueriesBeforeSort: [],
        };
    }

    const nodeResolveTree = resolveTree.fieldsByTypeName[node.fulltextTypeNames.result][node.singular];

    const nodeContext = { ...context, fulltextIndex: false };

    return createProjectionAndParams({
        resolveTree: nodeResolveTree,
        node,
        context: nodeContext,
        varName,
        literalElements,
        resolveType,
        cypherFieldAliasMap
    });
}
/**
 * Transform a filter applied in an interface as if it was applied to all the implementations,
 * if an implementation already has the same filter then that filter is kept and the interface filter is overridden by the implementation one.
 * */
function getAugmentedImplementationFilters(
    where: GraphQLWhereArg,
    interfaceSharedFilters: Record<string, any>,
    implementations: Node[]
) {
    return Object.fromEntries(
        implementations.map((node) => {
            if (!Object.prototype.hasOwnProperty.call(where, "_on")) {
                return [node.name, { ...interfaceSharedFilters }];
            }
            return [
                node.name,
                {
                    ...interfaceSharedFilters,
                    ...where["_on"][node.name],
                },
            ];
        })
    );
}
