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
import type { ConnectionField, ConnectionSortArg, CypherFieldReferenceMap } from "../../types";
import type { Node } from "../../classes";

import createProjectionAndParams from "../create-projection-and-params";
import type Relationship from "../../classes/Relationship";
import { createRelationshipPropertyValue } from "../projection/elements/create-relationship-property-value";
import { generateMissingOrAliasedFields } from "../utils/resolveTree";
import Cypher from "@neo4j/cypher-builder";
import type { Neo4jGraphQLTranslationContext } from "../../types/neo4j-graphql-translation-context";

export function createEdgeProjection({
    resolveTree,
    field,
    relationshipRef,
    relatedNodeVariableName,
    context,
    relatedNode,
    resolveType,
    extraFields = [],
    cypherFieldAliasMap,
}: {
    resolveTree: ResolveTree;
    field: ConnectionField;
    relationshipRef: Cypher.Relationship;
    relatedNodeVariableName: Cypher.Node;
    context: Neo4jGraphQLTranslationContext;
    relatedNode: Node;
    resolveType?: boolean;
    extraFields?: Array<string>;
    cypherFieldAliasMap: CypherFieldReferenceMap;
}): { projection: Cypher.Map; subqueries: Cypher.Clause[]; predicates: Cypher.Predicate[] } {
    const connection = resolveTree.fieldsByTypeName[field.typeMeta.name] as Record<string, ResolveTree>;

    const edgeProjectionProperties = new Cypher.Map();
    const subqueries: Cypher.Clause[] = [];
    const predicates: Cypher.Predicate[] = [];

    if (connection.edges) {
        const relationship = context.relationships.find((r) => r.name === field.relationshipTypeName) as Relationship;
        const relationshipFieldsByTypeName = connection.edges.fieldsByTypeName[field.relationshipTypeName] as Record<
            string,
            ResolveTree
        >;
        const relationshipProperties = Object.values(relationshipFieldsByTypeName).filter((v) => v.name !== "node");
        if (relationshipProperties.length || extraFields.length) {
            const relationshipPropertyEntries = relationshipProperties.filter((p) => p.name !== "cursor");

            for (const property of relationshipPropertyEntries) {
                const prop = createRelationshipPropertyValue({
                    resolveTree: property,
                    relationship,
                    relationshipVariable: relationshipRef,
                });

                edgeProjectionProperties.set(property.alias, prop);
            }

            for (const extraField of extraFields) {
                const prop = relationshipRef.property(extraField);
                edgeProjectionProperties.set(extraField, prop);
            }
        }

        const nodeField = Object.values(relationshipFieldsByTypeName).find((v) => v.name === "node");
        if (nodeField) {
            const nodeProjection = createConnectionNodeProjection({
                nodeResolveTree: nodeField,
                context,
                node: relatedNode,
                resolveTree,
                nodeRefVarName: relatedNodeVariableName,
                resolveType,
                cypherFieldAliasMap,
            });
            const alias = nodeField.alias;
            edgeProjectionProperties.set(alias, nodeProjection.projection);
            subqueries.push(...nodeProjection.subqueries);
            predicates.push(...nodeProjection.predicates);
        }
    } else {
        // This ensures that totalCount calculation is accurate if edges are not asked for

        return {
            projection: new Cypher.Map({
                node: new Cypher.Map({
                    __resolveType: new Cypher.Literal(relatedNode.name),
                    __id: Cypher.id(relatedNodeVariableName),
                }),
            }),
            subqueries,
            predicates,
        };
    }

    return { projection: edgeProjectionProperties, subqueries, predicates };
}

function createConnectionNodeProjection({
    nodeResolveTree,
    nodeRefVarName,
    context,
    node,
    resolveType = false,
    resolveTree,
    cypherFieldAliasMap,
}: {
    nodeResolveTree: ResolveTree;
    context;
    nodeRefVarName: Cypher.Node;
    node: Node;
    resolveType?: boolean;
    resolveTree: ResolveTree; // Global resolve tree
    cypherFieldAliasMap: CypherFieldReferenceMap;
}): { projection: Cypher.Expr; subqueries: Cypher.Clause[]; predicates: Cypher.Predicate[] } {
    const selectedFields: Record<string, ResolveTree> = mergeDeep([
        nodeResolveTree.fieldsByTypeName[node.name],
        ...node.interfaces.map((i) => nodeResolveTree?.fieldsByTypeName[i.name.value]),
    ]);

    const sortInput = (resolveTree.args.sort ?? []) as ConnectionSortArg[];
    const nodeSortFields = sortInput.map(({ node: n = {} }) => Object.keys(n)).flat();
    const mergedResolveTree: ResolveTree = mergeDeep<ResolveTree[]>([
        nodeResolveTree,
        {
            ...nodeResolveTree,
            fieldsByTypeName: {
                [node.name]: generateMissingOrAliasedFields({
                    fieldNames: nodeSortFields,
                    selection: selectedFields,
                }),
            },
        },
    ]);

    const nodeProjectionAndParams = createProjectionAndParams({
        resolveTree: mergedResolveTree,
        node,
        context,
        varName: nodeRefVarName,
        literalElements: true,
        resolveType,
        cypherFieldAliasMap,
    });

    const projectionSubqueries = [
        ...nodeProjectionAndParams.subqueriesBeforeSort,
        ...nodeProjectionAndParams.subqueries,
    ];

    return {
        subqueries: projectionSubqueries,
        predicates: nodeProjectionAndParams.predicates,
        projection: nodeProjectionAndParams.projection,
    };
}
