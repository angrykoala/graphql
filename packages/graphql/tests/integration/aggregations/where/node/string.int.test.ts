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
import { graphql } from "graphql";
import { generate } from "randomstring";
import Neo4j from "../../../neo4j";
import { Neo4jGraphQL } from "../../../../../src/classes";
import { UniqueType } from "../../../../utils/graphql-types";

describe("aggregations-where-node-string", () => {
    let driver: Driver;
    let neo4j: Neo4j;

    beforeAll(async () => {
        neo4j = new Neo4j();
        driver = await neo4j.getDriver();
    });

    afterAll(async () => {
        await driver.close();
    });

    test("should return posts where a like String is EQUAL to", async () => {
        const session = await neo4j.getSession();

        const typeDefs = `
            type User {
                testString: String!
            }

            type Post {
              testString: String!
              likes: [User!]! @relationship(type: "LIKES", direction: IN)
            }
        `;

        const testString = generate({
            charset: "alphabetic",
            readable: true,
        });

        const neoSchema = new Neo4jGraphQL({ typeDefs });

        try {
            await session.run(
                `
                    CREATE (:Post {testString: "${testString}"})<-[:LIKES]-(:User {testString: "${testString}"})
                    CREATE (:Post {testString: "${testString}"})
                `
            );

            const query = `
                {
                    posts(where: { testString: "${testString}", likesAggregate: { node: { testString_EQUAL: "${testString}" } } }) {
                        testString
                        likes {
                            testString
                        }
                    }
                }
            `;

            const gqlResult = await graphql({
                schema: await neoSchema.getSchema(),
                source: query,
                contextValue: neo4j.getContextValues(),
            });

            if (gqlResult.errors) {
                console.log(JSON.stringify(gqlResult.errors, null, 2));
            }

            expect(gqlResult.errors).toBeUndefined();

            expect((gqlResult.data as any).posts).toEqual([
                {
                    testString,
                    likes: [{ testString }],
                },
            ]);
        } finally {
            await session.close();
        }
    });

    test("should return posts where a like String is GT than", async () => {
        const session = await neo4j.getSession();

        const typeDefs = `
            type User {
                testString: String!
            }

            type Post {
              testString: String!
              likes: [User!]! @relationship(type: "LIKES", direction: IN)
            }
        `;

        const length = 5;
        const gtLength = length - 1;

        const testString = generate({
            charset: "alphabetic",
            readable: true,
            length,
        });

        const neoSchema = new Neo4jGraphQL({ typeDefs });

        try {
            await session.run(
                `
                    CREATE (:Post {testString: "${testString}"})<-[:LIKES]-(:User {testString: "${testString}"})
                    CREATE (:Post {testString: "${testString}"})
                `
            );

            const query = `
                {
                    posts(where: { testString: "${testString}", likesAggregate: { node: { testString_GT: ${gtLength} } } }) {
                        testString
                        likes {
                            testString
                        }
                    }
                }
            `;

            const gqlResult = await graphql({
                schema: await neoSchema.getSchema(),
                source: query,
                contextValue: neo4j.getContextValues(),
            });

            if (gqlResult.errors) {
                console.log(JSON.stringify(gqlResult.errors, null, 2));
            }

            expect(gqlResult.errors).toBeUndefined();

            expect((gqlResult.data as any).posts).toEqual([
                {
                    testString,
                    likes: [{ testString }],
                },
            ]);
        } finally {
            await session.close();
        }
    });

    test("should return posts where a like String is GTE than", async () => {
        const session = await neo4j.getSession();

        const typeDefs = `
            type User {
                testString: String!
            }

            type Post {
              testString: String!
              likes: [User!]! @relationship(type: "LIKES", direction: IN)
            }
        `;

        const length = 5;

        const testString = generate({
            charset: "alphabetic",
            readable: true,
            length,
        });

        const neoSchema = new Neo4jGraphQL({ typeDefs });

        try {
            await session.run(
                `
                    CREATE (:Post {testString: "${testString}"})<-[:LIKES]-(:User {testString: "${testString}"})
                    CREATE (:Post {testString: "${testString}"})
                `
            );

            const query = `
                {
                    posts(where: { testString: "${testString}", likesAggregate: { node: { testString_GTE: ${length} } } }) {
                        testString
                        likes {
                            testString
                        }
                    }
                }
            `;

            const gqlResult = await graphql({
                schema: await neoSchema.getSchema(),
                source: query,
                contextValue: neo4j.getContextValues(),
            });

            if (gqlResult.errors) {
                console.log(JSON.stringify(gqlResult.errors, null, 2));
            }

            expect(gqlResult.errors).toBeUndefined();

            expect((gqlResult.data as any).posts).toEqual([
                {
                    testString,
                    likes: [{ testString }],
                },
            ]);
        } finally {
            await session.close();
        }
    });

    test("should return posts where a like String is LT than", async () => {
        const session = await neo4j.getSession();

        const typeDefs = `
            type User {
                testString: String!
            }

            type Post {
              testString: String!
              likes: [User!]! @relationship(type: "LIKES", direction: IN)
            }
        `;

        const length = 5;

        const testString = generate({
            charset: "alphabetic",
            readable: true,
            length: length - 1,
        });

        const neoSchema = new Neo4jGraphQL({ typeDefs });

        try {
            await session.run(
                `
                    CREATE (:Post {testString: "${testString}"})<-[:LIKES]-(:User {testString: "${testString}"})
                    CREATE (:Post {testString: "${testString}"})
                `
            );

            const query = `
                {
                    posts(where: { testString: "${testString}", likesAggregate: { node: { testString_LT: ${length} } } }) {
                        testString
                        likes {
                            testString
                        }
                    }
                }
            `;

            const gqlResult = await graphql({
                schema: await neoSchema.getSchema(),
                source: query,
                contextValue: neo4j.getContextValues(),
            });

            if (gqlResult.errors) {
                console.log(JSON.stringify(gqlResult.errors, null, 2));
            }

            expect(gqlResult.errors).toBeUndefined();

            expect((gqlResult.data as any).posts).toEqual([
                {
                    testString,
                    likes: [{ testString }],
                },
            ]);
        } finally {
            await session.close();
        }
    });

    test("should return posts where a like String is LTE than", async () => {
        const session = await neo4j.getSession();

        const typeDefs = `
            type User {
                testString: String!
            }

            type Post {
              testString: String!
              likes: [User!]! @relationship(type: "LIKES", direction: IN)
            }
        `;

        const length = 5;

        const testString = generate({
            charset: "alphabetic",
            readable: true,
            length,
        });

        const neoSchema = new Neo4jGraphQL({ typeDefs });

        try {
            await session.run(
                `
                    CREATE (:Post {testString: "${testString}"})<-[:LIKES]-(:User {testString: "${testString}"})
                    CREATE (:Post {testString: "${testString}"})
                `
            );

            const query = `
                {
                    posts(where: { testString: "${testString}", likesAggregate: { node: { testString_LTE: ${length} } } }) {
                        testString
                        likes {
                            testString
                        }
                    }
                }
            `;

            const gqlResult = await graphql({
                schema: await neoSchema.getSchema(),
                source: query,
                contextValue: neo4j.getContextValues(),
            });

            if (gqlResult.errors) {
                console.log(JSON.stringify(gqlResult.errors, null, 2));
            }

            expect(gqlResult.errors).toBeUndefined();

            expect((gqlResult.data as any).posts).toEqual([
                {
                    testString,
                    likes: [{ testString }],
                },
            ]);
        } finally {
            await session.close();
        }
    });

    describe("SHORTEST", () => {
        test.each(["SHORTEST", "SHORTEST_LENGTH"])(
            "should return posts where the %s like String is EQUAL to",
            async (shortestFilter) => {
                const session = await neo4j.getSession();

                const typeDefs = `
                type User {
                    testString: String!
                }

                type Post {
                  testString: String!
                  likes: [User!]! @relationship(type: "LIKES", direction: IN)
                }
            `;

                const testString = generate({
                    charset: "alphabetic",
                    readable: true,
                });

                const shortestTestString = generate({
                    charset: "alphabetic",
                    readable: true,
                    length: 10,
                });

                const testString2 = generate({
                    charset: "alphabetic",
                    readable: true,
                    length: 11,
                });

                const longestTestString = generate({
                    charset: "alphabetic",
                    readable: true,
                    length: 12,
                });

                const neoSchema = new Neo4jGraphQL({ typeDefs });

                try {
                    await session.run(
                        `
                        CREATE (:Post {testString: "${testString}"})<-[:LIKES]-(:User {testString: "${shortestTestString}"})
                        CREATE (:Post {testString: "${testString}"})<-[:LIKES]-(:User {testString: "${testString2}"})
                        CREATE (:Post {testString: "${testString}"})<-[:LIKES]-(:User {testString: "${longestTestString}"})
                    `
                    );

                    const query = `
                    {
                        posts(where: { testString: "${testString}", likesAggregate: { node: { testString_${shortestFilter}_EQUAL: ${shortestTestString.length} } } }) {
                            testString
                            likes {
                                testString
                            }
                        }
                    }
                `;

                    const gqlResult = await graphql({
                        schema: await neoSchema.getSchema(),
                        source: query,
                        contextValue: neo4j.getContextValues(),
                    });

                    if (gqlResult.errors) {
                        console.log(JSON.stringify(gqlResult.errors, null, 2));
                    }

                    expect(gqlResult.errors).toBeUndefined();

                    expect((gqlResult.data as any).posts).toEqual([
                        {
                            testString,
                            likes: [{ testString: shortestTestString }],
                        },
                    ]);
                } finally {
                    await session.close();
                }
            }
        );
    });

    describe("LONGEST", () => {
        test.each(["LONGEST", "LONGEST_LENGTH"])(
            "should return posts where the %s like String is EQUAL to",
            async (longestFilter) => {
                const session = await neo4j.getSession();

                const typeDefs = `
                type User {
                    testString: String!
                }

                type Post {
                  testString: String!
                  likes: [User!]! @relationship(type: "LIKES", direction: IN)
                }
            `;

                const testString = generate({
                    charset: "alphabetic",
                    readable: true,
                });

                const shortestTestString = generate({
                    charset: "alphabetic",
                    readable: true,
                    length: 10,
                });

                const testString2 = generate({
                    charset: "alphabetic",
                    readable: true,
                    length: 11,
                });

                const longestTestString = generate({
                    charset: "alphabetic",
                    readable: true,
                    length: 12,
                });

                const neoSchema = new Neo4jGraphQL({ typeDefs });

                try {
                    await session.run(
                        `
                        CREATE (:Post {testString: "${testString}"})<-[:LIKES]-(:User {testString: "${shortestTestString}"})
                        CREATE (:Post {testString: "${testString}"})<-[:LIKES]-(:User {testString: "${testString2}"})
                        CREATE (:Post {testString: "${testString}"})<-[:LIKES]-(:User {testString: "${longestTestString}"})
                    `
                    );

                    const query = `
                    {
                        posts(where: { testString: "${testString}", likesAggregate: { node: { testString_${longestFilter}_EQUAL: ${longestTestString.length} } } }) {
                            testString
                            likes {
                                testString
                            }
                        }
                    }
                `;

                    const gqlResult = await graphql({
                        schema: await neoSchema.getSchema(),
                        source: query,
                        contextValue: neo4j.getContextValues(),
                    });

                    if (gqlResult.errors) {
                        console.log(JSON.stringify(gqlResult.errors, null, 2));
                    }

                    expect(gqlResult.errors).toBeUndefined();

                    expect((gqlResult.data as any).posts).toEqual([
                        {
                            testString,
                            likes: [{ testString: longestTestString }],
                        },
                    ]);
                } finally {
                    await session.close();
                }
            }
        );
    });

    describe("AVERAGE", () => {
        test.each(["AVERAGE", "AVERAGE_LENGTH"])(
            "should return posts where the %s of like Strings is EQUAL to",
            async (averageFilter) => {
                const session = await neo4j.getSession();

                const typeDefs = `
                type User {
                    testString: String!
                }

                type Post {
                  testString: String!
                  likes: [User!]! @relationship(type: "LIKES", direction: IN)
                }
            `;

                const testString = generate({
                    charset: "alphabetic",
                    readable: true,
                    length: 10,
                });

                const testString1 = generate({
                    charset: "alphabetic",
                    readable: true,
                    length: 10,
                });

                const testString2 = generate({
                    charset: "alphabetic",
                    readable: true,
                    length: 11,
                });

                const testString3 = generate({
                    charset: "alphabetic",
                    readable: true,
                    length: 12,
                });

                const avg = (10 + 11 + 12) / 3;

                const neoSchema = new Neo4jGraphQL({ typeDefs });

                try {
                    await session.run(
                        `
                        CREATE (p:Post {testString: "${testString}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString1}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString2}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString3}"})
                        CREATE (:Post {testString: "${testString}"})
                    `
                    );

                    const query = `
                    {
                        posts(where: { testString: "${testString}", likesAggregate: { node: { testString_${averageFilter}_EQUAL: ${avg} } } }) {
                            testString
                            likes {
                                testString
                            }
                        }
                    }
                `;

                    const gqlResult = await graphql({
                        schema: await neoSchema.getSchema(),
                        source: query,
                        contextValue: neo4j.getContextValues(),
                    });

                    if (gqlResult.errors) {
                        console.log(JSON.stringify(gqlResult.errors, null, 2));
                    }

                    expect(gqlResult.errors).toBeUndefined();

                    const [post] = (gqlResult.data as any).posts as any[];
                    expect(post.testString).toEqual(testString);
                    expect(post.likes).toHaveLength(3);
                } finally {
                    await session.close();
                }
            }
        );

        test("should return posts where the average of like Strings is GT than", async () => {
            const session = await neo4j.getSession();

            const typeDefs = `
                type User {
                    testString: String!
                }

                type Post {
                  testString: String!
                  likes: [User!]! @relationship(type: "LIKES", direction: IN)
                }
            `;

            const testString = generate({
                charset: "alphabetic",
                readable: true,
                length: 10,
            });

            const testString1 = generate({
                charset: "alphabetic",
                readable: true,
                length: 10,
            });

            const testString2 = generate({
                charset: "alphabetic",
                readable: true,
                length: 11,
            });

            const testString3 = generate({
                charset: "alphabetic",
                readable: true,
                length: 12,
            });

            const avg = (10 + 11 + 12) / 3;
            const avgGT = avg - 1;

            const neoSchema = new Neo4jGraphQL({ typeDefs });

            try {
                await session.run(
                    `
                        CREATE (p:Post {testString: "${testString}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString1}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString2}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString3}"})
                        CREATE (:Post {testString: "${testString}"})
                    `
                );

                const query = `
                    {
                        posts(where: { testString: "${testString}", likesAggregate: { node: { testString_AVERAGE_GT: ${avgGT} } } }) {
                            testString
                            likes {
                                testString
                            }
                        }
                    }
                `;

                const gqlResult = await graphql({
                    schema: await neoSchema.getSchema(),
                    source: query,
                    contextValue: neo4j.getContextValues(),
                });

                if (gqlResult.errors) {
                    console.log(JSON.stringify(gqlResult.errors, null, 2));
                }

                expect(gqlResult.errors).toBeUndefined();

                const [post] = (gqlResult.data as any).posts as any[];
                expect(post.testString).toEqual(testString);
                expect(post.likes).toHaveLength(3);
            } finally {
                await session.close();
            }
        });

        test("should return posts where the average of like Strings is GTE than", async () => {
            const session = await neo4j.getSession();

            const typeDefs = `
                type User {
                    testString: String!
                }

                type Post {
                  testString: String!
                  likes: [User!]! @relationship(type: "LIKES", direction: IN)
                }
            `;

            const testString = generate({
                charset: "alphabetic",
                readable: true,
                length: 10,
            });

            const testString1 = generate({
                charset: "alphabetic",
                readable: true,
                length: 10,
            });

            const testString2 = generate({
                charset: "alphabetic",
                readable: true,
                length: 11,
            });

            const testString3 = generate({
                charset: "alphabetic",
                readable: true,
                length: 12,
            });

            const avg = (10 + 11 + 12) / 3;

            const neoSchema = new Neo4jGraphQL({ typeDefs });

            try {
                await session.run(
                    `
                        CREATE (p:Post {testString: "${testString}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString1}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString2}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString3}"})
                        CREATE (:Post {testString: "${testString}"})
                    `
                );

                const query = `
                    {
                        posts(where: { testString: "${testString}", likesAggregate: { node: { testString_AVERAGE_GTE: ${avg} } } }) {
                            testString
                            likes {
                                testString
                            }
                        }
                    }
                `;

                const gqlResult = await graphql({
                    schema: await neoSchema.getSchema(),
                    source: query,
                    contextValue: neo4j.getContextValues(),
                });

                if (gqlResult.errors) {
                    console.log(JSON.stringify(gqlResult.errors, null, 2));
                }

                expect(gqlResult.errors).toBeUndefined();

                const [post] = (gqlResult.data as any).posts as any[];
                expect(post.testString).toEqual(testString);
                expect(post.likes).toHaveLength(3);
            } finally {
                await session.close();
            }
        });

        test("should return posts where the average of like Strings is LT than", async () => {
            const session = await neo4j.getSession();

            const typeDefs = `
                type User {
                    testString: String!
                }

                type Post {
                  testString: String!
                  likes: [User!]! @relationship(type: "LIKES", direction: IN)
                }
            `;

            const testString = generate({
                charset: "alphabetic",
                readable: true,
                length: 10,
            });

            const testString1 = generate({
                charset: "alphabetic",
                readable: true,
                length: 10,
            });

            const testString2 = generate({
                charset: "alphabetic",
                readable: true,
                length: 11,
            });

            const testString3 = generate({
                charset: "alphabetic",
                readable: true,
                length: 12,
            });

            const avg = (10 + 11 + 12) / 3;
            const avgLT = avg + 1;

            const neoSchema = new Neo4jGraphQL({ typeDefs });

            try {
                await session.run(
                    `
                        CREATE (p:Post {testString: "${testString}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString1}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString2}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString3}"})
                        CREATE (:Post {testString: "${testString}"})
                    `
                );

                const query = `
                    {
                        posts(where: { testString: "${testString}", likesAggregate: { node: { testString_AVERAGE_LT: ${avgLT} } } }) {
                            testString
                            likes {
                                testString
                            }
                        }
                    }
                `;

                const gqlResult = await graphql({
                    schema: await neoSchema.getSchema(),
                    source: query,
                    contextValue: neo4j.getContextValues(),
                });

                if (gqlResult.errors) {
                    console.log(JSON.stringify(gqlResult.errors, null, 2));
                }

                expect(gqlResult.errors).toBeUndefined();

                const [post] = (gqlResult.data as any).posts as any[];
                expect(post.testString).toEqual(testString);
                expect(post.likes).toHaveLength(3);
            } finally {
                await session.close();
            }
        });

        test("should return posts where the average of like Strings is LTE than", async () => {
            const session = await neo4j.getSession();

            const typeDefs = `
                type User {
                    testString: String!
                }

                type Post {
                  testString: String!
                  likes: [User!]! @relationship(type: "LIKES", direction: IN)
                }
            `;

            const testString = generate({
                charset: "alphabetic",
                readable: true,
                length: 10,
            });

            const testString1 = generate({
                charset: "alphabetic",
                readable: true,
                length: 10,
            });

            const testString2 = generate({
                charset: "alphabetic",
                readable: true,
                length: 11,
            });

            const testString3 = generate({
                charset: "alphabetic",
                readable: true,
                length: 12,
            });

            const avg = (10 + 11 + 12) / 3;

            const neoSchema = new Neo4jGraphQL({ typeDefs });

            try {
                await session.run(
                    `
                        CREATE (p:Post {testString: "${testString}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString1}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString2}"})
                        CREATE (p)<-[:LIKES]-(:User {testString: "${testString3}"})
                        CREATE (:Post {testString: "${testString}"})
                    `
                );

                const query = `
                    {
                        posts(where: { testString: "${testString}", likesAggregate: { node: { testString_AVERAGE_LTE: ${avg} } } }) {
                            testString
                            likes {
                                testString
                            }
                        }
                    }
                `;

                const gqlResult = await graphql({
                    schema: await neoSchema.getSchema(),
                    source: query,
                    contextValue: neo4j.getContextValues(),
                });

                if (gqlResult.errors) {
                    console.log(JSON.stringify(gqlResult.errors, null, 2));
                }

                expect(gqlResult.errors).toBeUndefined();

                const [post] = (gqlResult.data as any).posts as any[];
                expect(post.testString).toEqual(testString);
                expect(post.likes).toHaveLength(3);
            } finally {
                await session.close();
            }
        });
    });

    test("EQUAL with alias", async () => {
        const Post = new UniqueType("Post");
        const User = new UniqueType("Post");

        const session = await neo4j.getSession();

        const typeDefs = `
            type ${User} {
                name: String! @alias(property: "_name")
            }
            type ${Post} {
                content: String
                likes: [${User}!]! @relationship(type: "LIKES", direction: IN)
            }
            interface Likes {
                someString: String
            }
        `;

        const query = `
            {
                ${Post.plural}(where: { likesAggregate: { node: {name_EQUAL: "a"  } } }) {
                    content
                }
            }
        `;

        await session.run(
            `
            CREATE(p:${Post} {content: "test"})<-[:LIKES]-(:${User} {_name: "a"})
            CREATE(p2:${Post} {content: "test2"})<-[:LIKES]-(:${User} {_name: "b"})
            `
        );

        const neoSchema = new Neo4jGraphQL({ typeDefs });
        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
        });

        if (gqlResult.errors) {
            console.log(JSON.stringify(gqlResult.errors, null, 2));
        }

        expect(gqlResult.errors).toBeUndefined();
        expect(gqlResult.data).toEqual({
            [Post.plural]: [{ content: "test" }],
        });
    });
});
