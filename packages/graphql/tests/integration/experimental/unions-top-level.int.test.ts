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

import type { Driver } from "neo4j-driver";
import Neo4j from "../neo4j";
import { Neo4jGraphQL } from "../../../src/classes";
import { UniqueType } from "../../utils/graphql-types";
import { graphql } from "graphql";
import type { GraphQLSchema } from "graphql";

describe("Top-level union query fields", () => {
    let driver: Driver;
    let neo4j: Neo4j;

    let GenreType: UniqueType;
    let MovieType: UniqueType;
    let schema: GraphQLSchema;
    let typeDefs: string;

    beforeAll(async () => {
        neo4j = new Neo4j();
        driver = await neo4j.getDriver();
    });

    beforeAll(async () => {
        GenreType = new UniqueType("Genre");
        MovieType = new UniqueType("Movie");

        typeDefs = `
        union Search = ${GenreType} | ${MovieType}

        type ${GenreType} {
            name: String
        }

        type ${MovieType} {
            title: String
            search: [Search!]! @relationship(type: "SEARCH", direction: OUT)
        }
        `;

        const session = await neo4j.getSession();

        try {
            await session.run(`
                CREATE (m:${MovieType} {title: "The Matrix"})
                CREATE (g:${GenreType} {name: "Action"})
                MERGE (m)-[:SEARCH]->(m)
                MERGE (m)-[:SEARCH]->(g)
            `);
        } finally {
            await session.close();
        }

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            resolvers: {},
            experimental: true,
        });
        schema = await neoSchema.getSchema();
    });

    afterAll(async () => {
        await driver.close();
    });

    test("should read top-level simple query on union", async () => {
        const query = `
            query {
                searches {
                    ... on ${GenreType} {
                        name
                    }
                    ... on ${MovieType} {
                        title
                        search {
                            ... on ${GenreType} {
                                name
                            }
                        }
                    }
                }
            }
        `;

        const gqlResult = await graphql({
            schema,
            source: query,
            contextValue: neo4j.getContextValues(),
        });

        expect(gqlResult.errors).toBeFalsy();

        expect((gqlResult.data as any).searches).toIncludeSameMembers([
            { name: "Action" },
            { title: "The Matrix", search: [{ name: "Action" }, {}] },
        ]);
    });

    test("should read top-level simple query on union with filters", async () => {
        const query = `
            query {
                searches(where: {${MovieType.name}: {title_NOT: "The Matrix"}, ${GenreType.name}: {}}) {
                    ... on ${GenreType} {
                        name
                    }
                    ... on ${MovieType} {
                        title
                        search {
                            ... on ${GenreType} {
                                name
                            }
                        }
                    }
                }
            }
        `;

        const gqlResult = await graphql({
            schema,
            source: query,
            contextValue: neo4j.getContextValues(),
        });

        expect(gqlResult.errors).toBeFalsy();

        expect((gqlResult.data as any).searches).toIncludeSameMembers([{ name: "Action" }]);
    });

    test("should read top-level simple query on union with filters - only specifying a filter for one constituent automatically filters-out the other constituents from the return data", async () => {
        const query = `
            query {
                searches(where: {${MovieType.name}: {title_NOT: "The Matrix"}}) {
                    ... on ${GenreType} {
                        name
                    }
                    ... on ${MovieType} {
                        title
                        search {
                            ... on ${GenreType} {
                                name
                            }
                        }
                    }
                }
            }
        `;

        const gqlResult = await graphql({
            schema,
            source: query,
            contextValue: neo4j.getContextValues(),
        });

        expect(gqlResult.errors).toBeFalsy();

        expect((gqlResult.data as any).searches).toIncludeSameMembers([]);
    });

    test("should read top-level simple query on union with filters on relationship field", async () => {
        const query = `
            query {
                searches(where: {${MovieType.name}: {searchConnection: {${GenreType.name}: {node: { name: "Action"} }}}}) {
                    ... on ${GenreType} {
                        name
                    }
                    ... on ${MovieType} {
                        title
                        search {
                            ... on ${GenreType} {
                                name
                            }
                        }
                    }
                }
            }
        `;

        const gqlResult = await graphql({
            schema,
            source: query,
            contextValue: neo4j.getContextValues(),
        });

        expect(gqlResult.errors).toBeFalsy();

        expect((gqlResult.data as any).searches).toIncludeSameMembers([
            { title: "The Matrix", search: [{ name: "Action" }, {}] },
        ]);
    });

    test("should read top-level simple query on union sorted", async () => {
        const query = `
            query {
                searches(options: {limit: 1, offset: 1}) {
                    ... on ${GenreType} {
                        name
                    }
                    ... on ${MovieType} {
                        title
                        search {
                            ... on ${GenreType} {
                                name
                            }
                        }
                    }
                }
            }
        `;

        const gqlResult = await graphql({
            schema,
            source: query,
            contextValue: neo4j.getContextValues(),
        });

        expect(gqlResult.errors).toBeFalsy();

        expect((gqlResult.data as any).searches).toIncludeSameMembers([
            { title: "The Matrix", search: [{ name: "Action" }, {}] },
        ]);
    });

    describe("add authorization", () => {
        beforeAll(async () => {
            typeDefs =
                typeDefs +
                `
                type JWT @jwt {
                    jwtAllowedNamesExample: String
                    roles: [String]
                }
                extend type ${GenreType.name} @authorization(
                    validate: [
                        { when: [BEFORE], operations: [READ], where: { node: { name: "$jwt.jwtAllowedNamesExample" } } }
                    ])
                extend type ${MovieType.name} @authorization(
                    filter: [
                        { operations: [READ], where: { jwt: { roles_INCLUDES: "admin" } } }
                    ]) 
                `;
            const neoGraphql = new Neo4jGraphQL({
                typeDefs,
                driver,
                experimental: true,
            });
            schema = await neoGraphql.getSchema();
        });

        test("should read top-level simple query on union when jwt correct", async () => {
            const query = `
                query {
                    searches {
                        ... on ${GenreType} {
                            name
                        }
                        ... on ${MovieType} {
                            title
                            search {
                                ... on ${GenreType} {
                                    name
                                }
                            }
                        }
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source: query,
                contextValue: neo4j.getContextValues({
                    jwt: {
                        jwtAllowedNamesExample: "Action",
                        roles: ["admin"],
                    },
                }),
            });

            expect(gqlResult.errors).toBeFalsy();

            expect((gqlResult.data as any).searches).toIncludeSameMembers([
                { name: "Action" },
                { title: "The Matrix", search: [{ name: "Action" }, {}] },
            ]);
        });

        test("should throw forbidden when jwt incorrect", async () => {
            const query = `
                query {
                    searches {
                        ... on ${GenreType} {
                            name
                        }
                        ... on ${MovieType} {
                            title
                            search {
                                ... on ${GenreType} {
                                    name
                                }
                            }
                        }
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source: query,
                contextValue: neo4j.getContextValues({
                    jwt: {
                        jwtAllowedNamesExample: "somenode",
                        roles: ["admin"],
                    },
                }),
            });

            expect(gqlResult.errors?.[0]?.message).toBe("Forbidden");
        });

        test("should not throw forbidden when jwt incorrect if filtering-out the authorized constituent", async () => {
            const query = `
                query {
                    searches(where: {${MovieType.name}: {title: "The Matrix"}}) {
                        ... on ${GenreType} {
                            name
                        }
                        ... on ${MovieType} {
                            title
                            
                        }
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source: query,
                contextValue: neo4j.getContextValues({
                    jwt: {
                        jwtAllowedNamesExample: "somenode",
                        roles: ["admin"],
                    },
                }),
            });

            expect(gqlResult.errors).toBeFalsy();

            expect((gqlResult.data as any).searches).toIncludeSameMembers([
                {
                    title: "The Matrix",
                },
            ]);
        });

        test("should combine filter with authorization filter", async () => {
            const query = `
                query {
                    searches(where: {
                        ${MovieType.name}: {
                            searchConnection: {
                                ${GenreType.name}: {
                                    node: { name: "Action"} 
                                }
                            }
                        }, 
                        ${GenreType.name}: {}
                    }) {
                        ... on ${GenreType} {
                            name
                        }
                        ... on ${MovieType} {
                            title
                            search {
                                ... on ${GenreType} {
                                    name
                                }
                            }
                        }
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source: query,
                contextValue: neo4j.getContextValues({
                    jwt: {
                        roles: [],
                        jwtAllowedNamesExample: "Action",
                    },
                }),
            });

            expect(gqlResult.errors).toBeFalsy();

            expect((gqlResult.data as any).searches).toIncludeSameMembers([{ name: "Action" }]);
        });
    });

    describe("add schema configuration", () => {
        beforeAll(async () => {
            typeDefs = typeDefs + `extend union Search @query(read: false)`;
            const neoGraphql = new Neo4jGraphQL({
                typeDefs,
                driver,
                experimental: true,
            });
            schema = await neoGraphql.getSchema();
        });

        test("should throw an error when trying to read top-level simple query on union", async () => {
            const query = `
                query {
                    searches {
                        ... on ${GenreType} {
                            name
                        }
                        ... on ${MovieType} {
                            title
                            search {
                                ... on ${GenreType} {
                                    name
                                }
                            }
                        }
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source: query,
                contextValue: neo4j.getContextValues(),
            });

            expect(gqlResult.errors).toHaveLength(1);
            expect(gqlResult.errors?.[0]).toHaveProperty("message", 'Cannot query field "searches" on type "Query".');
        });
    });
});
