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

import type { GraphQLSchema } from "graphql";
import { graphql } from "graphql";
import type { Driver } from "neo4j-driver";
import { Neo4jGraphQL } from "../../../src";
import { UniqueType } from "../../utils/graphql-types";
import Neo4j from "../neo4j";

describe("https://github.com/neo4j/graphql/issues/1683", () => {
    const systemType = new UniqueType("System");
    const governedDataTest = new UniqueType("GovernedData");

    let schema: GraphQLSchema;
    let neo4j: Neo4j;
    let driver: Driver;

    async function graphqlQuery(query: string) {
        return graphql({
            schema,
            source: query,
            contextValue: neo4j.getContextValues(),
        });
    }

    beforeAll(async () => {
        neo4j = new Neo4j();
        driver = await neo4j.getDriver();

        const typeDefs = `
            type ${systemType} {
                code: String!
                updatesData: [${governedDataTest}!]! @relationship(type: "UPDATED_BY", direction: IN)
            }
            type ${governedDataTest} {
                code: String!
                updatedBy: [${systemType}!]! @relationship(type: "UPDATED_BY", direction: OUT)
            }
        `;
        const neoGraphql = new Neo4jGraphQL({
            typeDefs,
            driver,
        });
        schema = await neoGraphql.getSchema();
    });

    afterAll(async () => {
        await driver.close();
    });

    test("should return top level entity, even if no connections exist", async () => {
        const query = `
            {
                ${systemType.plural} {
                    code
                    updatesDataConnection {
                        edges {
                            node {
                                code
                            }
                        }
                    }
                }
            }
        `;

        const cypher = `
            CREATE (s:${systemType} { code: "arthur" });
        `;

        const session = await neo4j.getSession();

        try {
            await session.run(cypher);
        } finally {
            await session.close();
        }

        const result = await graphqlQuery(query);
        expect(result.errors).toBeUndefined();
        expect(result.data as any).toEqual({
            [systemType.plural]: [{ code: "arthur", updatesDataConnection: { edges: [] } }],
        });
    });
});
