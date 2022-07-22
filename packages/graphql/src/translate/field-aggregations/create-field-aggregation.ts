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
import type { Node, Relationship } from "../../classes";
import type { Context, RelationField, GraphQLWhereArg } from "../../types";
import {
    getFieldType,
    AggregationType,
    getReferenceNode,
    getFieldByName,
    getReferenceRelation,
    serializeAuthParamsForApocRun,
} from "./utils";
import * as AggregationSubQueries from "./aggregation-sub-queries";
import { createFieldAggregationAuth } from "./field-aggregations-auth";
import { createMatchWherePattern } from "./aggregation-sub-queries";
import mapToDbProperty from "../../utils/map-to-db-property";
import createWhereAndParams from "../where/create-where-and-params";
import { stringifyObject } from "../utils/stringify-object";
import { serializeParamsForApocRun, wrapInApocRunFirstColumn } from "../utils/apoc-run";
import { FieldAggregationSchemaTypes } from "../../schema/aggregations/field-aggregation-composer";
import { upperFirst } from "../../utils/upper-first";
import { getRelationshipDirection, getRelationshipDirectionStr } from "../../utils/get-relationship-direction";
import * as CypherBuilder from "../cypher-builder/CypherBuilder";
import { createCypherWhereParams } from "../where/create-cypher-where-params";
// import { connectionFieldResolver } from "src/schema/pagination";

const subqueryNodeAlias = "n";
const subqueryRelationAlias = "r";

type AggregationFields = {
    count?: ResolveTree;
    node?: Record<string, ResolveTree>;
    edge?: Record<string, ResolveTree>;
};

// export function createFieldAggregation({
//     context,
//     nodeLabel,
//     node,
//     field,
// }: {
//     context: Context;
//     nodeLabel: string;
//     node: Node;
//     field: ResolveTree;
// }): { clause: CypherBuilder.Clause; variable: CypherBuilder.Variable } | undefined {
//     const relationAggregationField = node.relationFields.find((x) => {
//         return `${x.fieldName}Aggregate` === field.name;
//     });

//     const connectionField = node.connectionFields.find((x) => {
//         return `${relationAggregationField?.fieldName}Connection` === x.fieldName;
//     });

//     if (!relationAggregationField || !connectionField) return undefined;
//     const referenceNode = getReferenceNode(context, relationAggregationField);
//     const referenceRelation = getReferenceRelation(context, connectionField);

//     if (!referenceNode || !referenceRelation) return undefined;

//     const fieldPathBase = `${node.name}${referenceNode.name}${upperFirst(relationAggregationField.fieldName)}`;
//     const aggregationFields = getAggregationFields(fieldPathBase, field);
//     // const authData = createFieldAggregationAuth({
//     //     node: referenceNode,
//     //     context,
//     //     subqueryNodeAlias,
//     //     nodeFields: aggregationFields.node,
//     // });

//     // const [whereQuery, whereParams] = createWhereAndParams({
//     //     whereInput: (field.args.where as GraphQLWhereArg) || {},
//     //     varName: subqueryNodeAlias,
//     //     node: referenceNode,
//     //     context,
//     //     recursing: true,
//     //     chainStr: `${nodeLabel}_${field.alias}_${subqueryNodeAlias}`,
//     // });
//     const sourceNode = new CypherBuilder.NamedNode(nodeLabel);
//     const targetNode = new CypherBuilder.Node({ labels: referenceNode.getLabels(context) });

//     // TODO: getRelationshipDirectionStr
//     const relationship = new CypherBuilder.Relationship({
//         source: sourceNode,
//         target: targetNode,
//         type: relationAggregationField.type,
//     });

//     const direction = getRelationshipDirection(relationAggregationField, {
//         directed: field.args.directed as boolean | undefined,
//     });
//     if (direction === "IN") relationship.reverse();

//     const relationshipPattern = relationship.pattern({
//         directed: !(direction === "undirected"),
//     });

//     const whereParams = createCypherWhereParams({
//         element: node,
//         context,
//         whereInput: (field.args.where as GraphQLWhereArg) || {},
//         targetElement: targetNode,
//     });

//     const matchClause = new CypherBuilder.Match(relationshipPattern);
//     if (whereParams) {
//         matchClause.where(whereParams);
//     }

//     const resultMap = new CypherBuilder.Map();
//     const resultVar = new CypherBuilder.Variable();
//     if (aggregationFields.count) {
//         resultMap.set({ count: CypherBuilder.count(targetNode) });
//     }

//     if (aggregationFields.node) {
//         const matchWherePattern = createMatchWherePattern(targetPattern, authData, whereQuery);
//         const apocRunParams = {
//             ...serializeParamsForApocRun(whereParams as Record<string, any>),
//             ...serializeAuthParamsForApocRun(authData),
//         };
//         createAggregationQuery({
//             nodeLabel,
//             matchWherePattern,
//             fields: aggregationFields.node,
//             fieldAlias: subqueryNodeAlias,
//             graphElement: referenceNode,
//             params: apocRunParams,
//         });
//     }
//     if (aggregationFields.count) {
//         resultMap.set({ count: CypherBuilder.count(targetNode) });
//     }

//     matchClause.return([resultMap, resultVar]);
//     const call = new CypherBuilder.Call(matchClause).with(sourceNode);

//     return {
//         clause: call,
//         variable: resultVar,
//     };
// }

// function createAggregationSubquery({
//     fields,
//     match,
//     targetNode,
//     relationship,
//     direction,
// }: {
//     match: CypherBuilder.Match;
//     targetNode: CypherBuilder.Node;
//     fields: Record<string, ResolveTree>;
//     relationship: CypherBuilder.Relationship;
//     direction: "IN" | "OUT" | "undirected";
// }): CypherBuilder.Clause {
//     // const fieldPath = `${targetAlias}.${fieldName}`;
//     // return `${matchWherePattern}
//     //     WITH ${targetAlias} as ${targetAlias}
//     //     ORDER BY size(${fieldPath}) DESC
//     //     WITH collect(${fieldPath}) as list
//     //     RETURN {longest: head(list), shortest: last(list)}`;

//     const fieldsSubQueries = Object.values(fields).map((field): string => {
//         const fieldType = getFieldType(field);

//         switch (fieldType) {
//             case AggregationType.String:
//             case AggregationType.Id: {
//                 // console.log(field); // return AggregationSubQueries.stringAggregationQuery(matchWherePattern, fieldName, targetAlias);
//                 const pattern = relationship.pattern({
//                     directed: !(direction === "undirected"),
//                 });
//                 const match = new CypherBuilder.Match(pattern);
//                 match.with();
//                 match.return(new CypherBuilder.Variable());
//                 break;
//             }
//             case AggregationType.Int:
//             case AggregationType.BigInt:
//             case AggregationType.Float:
//                 console.log(field); // return AggregationSubQueries.numberAggregationQuery(matchWherePattern, fieldName, targetAlias);
//                 break;
//             case AggregationType.DateTime:
//                 // return AggregationSubQueries.dateTimeAggregationQuery(matchWherePattern, fieldName, targetAlias);
//                 console.log(field); // return AggregationSubQueries.numberAggregationQuery(matchWherePattern, fieldName, targetAlias);
//                 break;
//             default: // return AggregationSubQueries.defaultAggregationQuery(matchWherePattern, fieldName, targetAlias);
//                 console.log(field);
//                 break;
//         }

//         return "";
//     });
//     return {};
// }

export function createFieldAggregation({
    context,
    nodeLabel,
    node,
    field,
}: {
    context: Context;
    nodeLabel: string;
    node: Node;
    field: ResolveTree;
}): { query: string; params: Record<string, any> } | undefined {
    const relationAggregationField = node.relationFields.find((x) => {
        return `${x.fieldName}Aggregate` === field.name;
    });

    const connectionField = node.connectionFields.find((x) => {
        return `${relationAggregationField?.fieldName}Connection` === x.fieldName;
    });

    if (!relationAggregationField || !connectionField) return undefined;
    const referenceNode = getReferenceNode(context, relationAggregationField);
    const referenceRelation = getReferenceRelation(context, connectionField);

    if (!referenceNode || !referenceRelation) return undefined;

    const fieldPathBase = `${node.name}${referenceNode.name}${upperFirst(relationAggregationField.fieldName)}`;
    const aggregationFields = getAggregationFields(fieldPathBase, field);
    const authData = createFieldAggregationAuth({
        node: referenceNode,
        context,
        subqueryNodeAlias,
        nodeFields: aggregationFields.node,
    });

    const [whereQuery, whereParams] = createWhereAndParams({
        whereInput: (field.args.where as GraphQLWhereArg) || {},
        varName: subqueryNodeAlias,
        node: referenceNode,
        context,
        recursing: true,
        chainStr: `${nodeLabel}_${field.alias}_${subqueryNodeAlias}`,
    });

    const targetPattern = createTargetPattern({
        nodeLabel,
        relationField: relationAggregationField,
        referenceNode,
        context,
        directed: field.args.directed as boolean | undefined,
    });
    const matchWherePattern = createMatchWherePattern(targetPattern, authData, whereQuery);
    const apocRunParams = {
        ...serializeParamsForApocRun(whereParams as Record<string, any>),
        ...serializeAuthParamsForApocRun(authData),
    };

    return {
        query: stringifyObject({
            count: aggregationFields.count
                ? createCountQuery({
                      nodeLabel,
                      matchWherePattern,
                      targetAlias: subqueryNodeAlias,
                      params: apocRunParams,
                  })
                : undefined,
            node: aggregationFields.node
                ? createAggregationQuery({
                      nodeLabel,
                      matchWherePattern,
                      fields: aggregationFields.node,
                      fieldAlias: subqueryNodeAlias,
                      graphElement: referenceNode,
                      params: apocRunParams,
                  })
                : undefined,
            edge: aggregationFields.edge
                ? createAggregationQuery({
                      nodeLabel,
                      matchWherePattern,
                      fields: aggregationFields.edge,
                      fieldAlias: subqueryRelationAlias,
                      graphElement: referenceRelation,
                      params: apocRunParams,
                  })
                : undefined,
        }),
        params: { ...authData.params, ...whereParams },
    };
}

function getAggregationFields(fieldPathBase: string, field: ResolveTree): AggregationFields {
    const aggregationFields = field.fieldsByTypeName[`${fieldPathBase}${FieldAggregationSchemaTypes.field}`];
    const node: Record<string, ResolveTree> | undefined = getFieldByName("node", aggregationFields)?.fieldsByTypeName[
        `${fieldPathBase}${FieldAggregationSchemaTypes.node}`
    ];

    const edge: Record<string, ResolveTree> | undefined = getFieldByName("edge", aggregationFields)?.fieldsByTypeName[
        `${fieldPathBase}${FieldAggregationSchemaTypes.edge}`
    ];

    const count = getFieldByName("count", aggregationFields);

    return { count, edge, node };
}

function createTargetPattern({
    nodeLabel,
    relationField,
    referenceNode,
    context,
    directed,
}: {
    nodeLabel: string;
    relationField: RelationField;
    referenceNode: Node;
    context: Context;
    directed?: boolean;
}): string {
    const { inStr, outStr } = getRelationshipDirectionStr(relationField, { directed });
    const nodeOutStr = `(${subqueryNodeAlias}${referenceNode.getLabelString(context)})`;

    return `(${nodeLabel})${inStr}[${subqueryRelationAlias}:${relationField.type}]${outStr}${nodeOutStr}`;
}

function createCountQuery({
    nodeLabel,
    matchWherePattern,
    targetAlias,
    params,
}: {
    nodeLabel: string;
    matchWherePattern: string;
    targetAlias: string;
    params: Record<string, string>;
}): string {
    const apocCount = wrapInApocRunFirstColumn(AggregationSubQueries.countQuery(matchWherePattern, targetAlias), {
        ...params,
        [nodeLabel]: nodeLabel,
    });

    return `head(${apocCount})`;
}

function createAggregationQuery({
    nodeLabel,
    matchWherePattern,
    fields,
    fieldAlias,
    graphElement,
    params,
}: {
    nodeLabel: string;
    matchWherePattern: string;
    fields: Record<string, ResolveTree>;
    fieldAlias: string;
    graphElement: Node | Relationship;
    params: Record<string, string>;
}): string {
    const fieldsSubQueries = Object.values(fields).reduce((acc, field) => {
        const fieldType = getFieldType(field);
        const dbProperty = mapToDbProperty(graphElement, field.name);

        const aggregationQuery = wrapInApocRunFirstColumn(
            getAggregationSubquery({
                matchWherePattern,
                fieldName: dbProperty || field.name,
                type: fieldType,
                targetAlias: fieldAlias,
            }),
            {
                ...params,
                [nodeLabel]: nodeLabel,
            }
        );
        acc[field.alias] = `head(${aggregationQuery})`;
        return acc;
    }, {} as Record<string, string>);

    return stringifyObject(fieldsSubQueries);
}

function getAggregationSubquery({
    matchWherePattern,
    fieldName,
    type,
    targetAlias,
}: {
    matchWherePattern: string;
    fieldName: string;
    type: AggregationType | undefined;
    targetAlias: string;
}): string {
    switch (type) {
        case AggregationType.String:
        case AggregationType.Id:
            return AggregationSubQueries.stringAggregationQuery(matchWherePattern, fieldName, targetAlias);
        case AggregationType.Int:
        case AggregationType.BigInt:
        case AggregationType.Float:
            return AggregationSubQueries.numberAggregationQuery(matchWherePattern, fieldName, targetAlias);
        case AggregationType.DateTime:
            return AggregationSubQueries.dateTimeAggregationQuery(matchWherePattern, fieldName, targetAlias);
        default:
            return AggregationSubQueries.defaultAggregationQuery(matchWherePattern, fieldName, targetAlias);
    }
}
