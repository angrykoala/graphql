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

import { graphql } from "graphql";
import type { Driver } from "neo4j-driver";
import { generate } from "randomstring";
import { Neo4jGraphQL } from "../../../../src/classes";
import { createBearerToken } from "../../../utils/create-bearer-token";
import { UniqueType } from "../../../utils/graphql-types";
import Neo4j from "../../neo4j";

describe("aggregations-top_level authorization", () => {
    let driver: Driver;
    let neo4j: Neo4j;
    const secret = "secret";

    beforeAll(async () => {
        neo4j = new Neo4j();
        driver = await neo4j.getDriver();
    });

    afterAll(async () => {
        await driver.close();
    });

    test("should throw forbidden when incorrect allow on aggregate count", async () => {
        const session = await neo4j.getSession({ defaultAccessMode: "WRITE" });

        const randomType = new UniqueType("Movie");

        const typeDefs = `
            type ${randomType.name} {
                id: ID
            }

            extend type ${randomType.name} @authorization(validate: [ { operations: [AGGREGATE], when: BEFORE, where: { node: { id: "$jwt.sub" } } }])
        `;

        const userId = generate({
            charset: "alphabetic",
        });

        const query = `
            {
                ${randomType.operations.aggregate} {
                    count
                }
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: {
                authorization: {
                    key: secret,
                },
            },
        });

        try {
            await session.run(`
                CREATE (:${randomType.name} {id: "${userId}"})
            `);

            const token = createBearerToken(secret, { sub: "invalid" });

            const gqlResult = await graphql({
                schema: await neoSchema.getSchema(),
                source: query,
                contextValue: neo4j.getContextValues({ token }),
            });

            expect((gqlResult.errors as any[])[0].message).toBe("Forbidden");
        } finally {
            await session.close();
        }
    });

    test("should append auth where to predicate and return post count for this user", async () => {
        const session = await neo4j.getSession({ defaultAccessMode: "WRITE" });

        const typeDefs = `
            type User {
                id: ID
                posts: [Post!]! @relationship(type: "POSTED", direction: OUT)
            }

            type Post {
                content: String
                creator: User! @relationship(type: "POSTED", direction: IN)
            }

            extend type Post @authorization(filter: [{ operations: [AGGREGATE], where: { node: { creator: { id: "$jwt.sub" } } } }])
        `;

        const userId = generate({
            charset: "alphabetic",
        });

        const query = `
            {
                postsAggregate {
                    count
                }
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: {
                authorization: {
                    key: secret,
                },
            },
        });

        try {
            await session.run(`
                CREATE (:User {id: "${userId}"})-[:POSTED]->(:Post {content: randomUUID()})
            `);

            const token = createBearerToken(secret, { sub: userId });

            const gqlResult = await graphql({
                schema: await neoSchema.getSchema(),
                source: query,
                contextValue: neo4j.getContextValues({ token }),
            });

            expect(gqlResult.errors).toBeUndefined();

            expect(gqlResult.data).toEqual({
                postsAggregate: {
                    count: 1,
                },
            });
        } finally {
            await session.close();
        }
    });

    test("should throw when invalid allow when aggregating a Int field", async () => {
        const session = await neo4j.getSession({ defaultAccessMode: "WRITE" });

        const typeDefs = `
            type Movie {
                id: ID
                director: Person! @relationship(type: "DIRECTED", direction: IN)
                imdbRatingInt: Int  @authorization(validate: [ { when: BEFORE, where: { node: { director: { id: "$jwt.sub" } } } }])
            }

            type Person {
                id: ID
            }
        `;

        const movieId = generate({
            charset: "alphabetic",
        });

        const userId = generate({
            charset: "alphabetic",
        });

        const query = `
            {
                moviesAggregate(where: {id: "${movieId}"}) {
                    imdbRatingInt {
                        min
                        max
                    }
                }
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: {
                authorization: {
                    key: secret,
                },
            },
        });

        try {
            await session.run(`
                CREATE (:Person {id: "${userId}"})-[:DIRECTED]->(:Movie {id: "${movieId}", imdbRatingInt: rand()})
            `);

            const token = createBearerToken(secret, { sub: "invalid" });

            const gqlResult = await graphql({
                schema: await neoSchema.getSchema(),
                source: query,
                contextValue: neo4j.getContextValues({ token }),
            });

            expect((gqlResult.errors as any[])[0].message).toBe("Forbidden");
        } finally {
            await session.close();
        }
    });

    test("should throw when invalid allow when aggregating a ID field", async () => {
        const session = await neo4j.getSession({ defaultAccessMode: "WRITE" });

        const typeDefs = `
            type Movie {
                id: ID
                director: Person! @relationship(type: "DIRECTED", direction: IN)
                someId: ID  @authorization(validate: [ { when: BEFORE, where: { node: { director: { id: "$jwt.sub" } } } }])
            }

            type Person {
                id: ID
            }
        `;

        const movieId = generate({
            charset: "alphabetic",
        });

        const userId = generate({
            charset: "alphabetic",
        });

        const query = `
            {
                moviesAggregate(where: {id: "${movieId}"}) {
                    someId {
                        shortest
                        longest
                    }
                }
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: {
                authorization: {
                    key: secret,
                },
            },
        });

        try {
            await session.run(`
                CREATE (:Person {id: "${userId}"})-[:DIRECTED]->(:Movie {id: "${movieId}", someId: "some-random-string"})
            `);

            const token = createBearerToken(secret, { sub: "invalid" });

            const gqlResult = await graphql({
                schema: await neoSchema.getSchema(),
                source: query,
                contextValue: neo4j.getContextValues({ token }),
            });

            expect((gqlResult.errors as any[])[0].message).toBe("Forbidden");
        } finally {
            await session.close();
        }
    });

    test("should throw when invalid allow when aggregating a String field", async () => {
        const session = await neo4j.getSession({ defaultAccessMode: "WRITE" });

        const typeDefs = `
            type Movie {
                id: ID
                director: Person! @relationship(type: "DIRECTED", direction: IN)
                someString: String  @authorization(validate: [ { when: BEFORE, where: { node: { director: { id: "$jwt.sub" } } } }])
            }

            type Person {
                id: ID
            }
        `;

        const movieId = generate({
            charset: "alphabetic",
        });

        const userId = generate({
            charset: "alphabetic",
        });

        const query = `
            {
                moviesAggregate(where: {id: "${movieId}"}) {
                    someString {
                        shortest
                        longest
                    }
                }
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: {
                authorization: {
                    key: secret,
                },
            },
        });

        try {
            await session.run(`
                CREATE (:Person {id: "${userId}"})-[:DIRECTED]->(:Movie {id: "${movieId}", someString: "some-random-string"})
            `);

            const token = createBearerToken(secret, { sub: "invalid" });

            const gqlResult = await graphql({
                schema: await neoSchema.getSchema(),
                source: query,
                contextValue: neo4j.getContextValues({ token }),
            });

            expect((gqlResult.errors as any[])[0].message).toBe("Forbidden");
        } finally {
            await session.close();
        }
    });

    test("should throw when invalid allow when aggregating a Float field", async () => {
        const session = await neo4j.getSession({ defaultAccessMode: "WRITE" });

        const typeDefs = `
            type Movie {
                id: ID
                director: Person! @relationship(type: "DIRECTED", direction: IN)
                imdbRatingFloat: Float  @authorization(validate: [ {  when: BEFORE, where: { node: { director: { id: "$jwt.sub" } } } }])              
            }

            type Person {
                id: ID
            }
        `;

        const movieId = generate({
            charset: "alphabetic",
        });

        const userId = generate({
            charset: "alphabetic",
        });

        const query = `
            {
                moviesAggregate(where: {id: "${movieId}"}) {
                    imdbRatingFloat {
                        min
                        max
                    }
                }
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: {
                authorization: {
                    key: secret,
                },
            },
        });

        try {
            await session.run(`
                CREATE (:Person {id: "${userId}"})-[:DIRECTED]->(:Movie {id: "${movieId}", imdbRatingFloat: rand()})
            `);

            const token = createBearerToken(secret, { sub: "invalid" });

            const gqlResult = await graphql({
                schema: await neoSchema.getSchema(),
                source: query,
                contextValue: neo4j.getContextValues({ token }),
            });

            expect((gqlResult.errors as any[])[0].message).toBe("Forbidden");
        } finally {
            await session.close();
        }
    });

    test("should throw when invalid allow when aggregating a BigInt field", async () => {
        const session = await neo4j.getSession({ defaultAccessMode: "WRITE" });

        const typeDefs = `
            type Movie {
                id: ID
                director: Person! @relationship(type: "DIRECTED", direction: IN)
                imdbRatingBigInt: BigInt @authorization(validate: [ {  when: BEFORE, where: { node: { director: { id: "$jwt.sub" } } } }])
            }

            type Person {
                id: ID
            }
        `;

        const movieId = generate({
            charset: "alphabetic",
        });

        const userId = generate({
            charset: "alphabetic",
        });

        const query = `
            {
                moviesAggregate(where: {id: "${movieId}"}) {
                    imdbRatingBigInt {
                        min
                        max
                    }
                }
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: {
                authorization: {
                    key: secret,
                },
            },
        });

        try {
            await session.run(`
                CREATE (:Person {id: "${userId}"})-[:DIRECTED]->(:Movie {id: "${movieId}", imdbRatingBigInt: rand()})
            `);

            const token = createBearerToken(secret, { sub: "invalid" });

            const gqlResult = await graphql({
                schema: await neoSchema.getSchema(),
                source: query,
                contextValue: neo4j.getContextValues({ token }),
            });

            expect((gqlResult.errors as any[])[0].message).toBe("Forbidden");
        } finally {
            await session.close();
        }
    });

    test("should throw when invalid allow when aggregating a DateTime field", async () => {
        const session = await neo4j.getSession({ defaultAccessMode: "WRITE" });

        const typeDefs = `
            type Movie {
                id: ID
                director: Person! @relationship(type: "DIRECTED", direction: IN)
                createdAt: DateTime  @authorization(validate: [ { when: BEFORE, where: { node: { director: { id: "$jwt.sub" } } } }])
            }

            type Person {
                id: ID
            }
        `;

        const movieId = generate({
            charset: "alphabetic",
        });

        const userId = generate({
            charset: "alphabetic",
        });

        const query = `
            {
                moviesAggregate(where: {id: "${movieId}"}) {
                    createdAt {
                        min
                        max
                    }
                }
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: {
                authorization: {
                    key: secret,
                },
            },
        });

        try {
            await session.run(`
                CREATE (:Person {id: "${userId}"})-[:DIRECTED]->(:Movie {id: "${movieId}", createdAt: datetime()})
            `);

            const token = createBearerToken(secret, { sub: "invalid" });

            const gqlResult = await graphql({
                schema: await neoSchema.getSchema(),
                source: query,
                contextValue: neo4j.getContextValues({ token }),
            });

            expect((gqlResult.errors as any[])[0].message).toBe("Forbidden");
        } finally {
            await session.close();
        }
    });

    test("should throw when invalid allow when aggregating a Duration field", async () => {
        const session = await neo4j.getSession({ defaultAccessMode: "WRITE" });

        const typeDefs = `
            type Movie {
                id: ID
                director: Person! @relationship(type: "DIRECTED", direction: IN)
                screenTime: Duration  @authorization(validate: [ { when: BEFORE, where: { node: { director: { id: "$jwt.sub" } } } }])
            }

            type Person {
                id: ID
            }
        `;

        const movieId = generate({
            charset: "alphabetic",
        });

        const userId = generate({
            charset: "alphabetic",
        });

        const query = `
            {
                moviesAggregate(where: {id: "${movieId}"}) {
                    screenTime {
                        min
                        max
                    }
                }
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: {
                authorization: {
                    key: secret,
                },
            },
        });

        try {
            await session.run(`
                CREATE (:Person {id: "${userId}"})-[:DIRECTED]->(:Movie {id: "${movieId}", createdAt: datetime()})
            `);

            const token = createBearerToken(secret, { sub: "invalid" });

            const gqlResult = await graphql({
                schema: await neoSchema.getSchema(),
                source: query,
                contextValue: neo4j.getContextValues({ token }),
            });

            expect((gqlResult.errors as any[])[0].message).toBe("Forbidden");
        } finally {
            await session.close();
        }
    });
});
