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

import type { DocumentNode } from "graphql";
import gql from "graphql-tag";
import { Neo4jGraphQL } from "../../../../src";
import { formatCypher, formatParams, translateQuery } from "../../utils/tck-test-utils";

describe("Create or Connect", () => {
    describe("Simple", () => {
        let typeDefs: DocumentNode;
        let neoSchema: Neo4jGraphQL;

        beforeAll(() => {
            typeDefs = gql`
                type Movie {
                    title: String! @unique
                    actors: [Actor!]! @relationship(type: "ACTED_IN", properties: "ActedIn", direction: IN)
                }

                type Actor {
                    name: String!
                    movies: [Movie!]! @relationship(type: "ACTED_IN", properties: "ActedIn", direction: OUT)
                }

                interface ActedIn @relationshipProperties {
                    screentime: Int!
                }
            `;

            neoSchema = new Neo4jGraphQL({
                typeDefs,
            });
        });

        test("Create with createOrConnect operation", async () => {
            const query = gql`
                mutation {
                    createActors(
                        input: [
                            {
                                name: "Tom Hanks"
                                movies: {
                                    connectOrCreate: {
                                        where: { node: { title: "The Terminal" } }
                                        onCreate: { edge: { screentime: 105 }, node: { title: "The Terminal" } }
                                    }
                                }
                            }
                        ]
                    ) {
                        actors {
                            name
                        }
                    }
                }
            `;

            const result = await translateQuery(neoSchema, query);

            expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
                "CALL {
                CREATE (this0:Actor)
                SET this0.name = $this0_name
                WITH this0
                CALL {
                    WITH this0
                    MERGE (this0_movies_connectOrCreate0:Movie { title: $this0_movies_connectOrCreate_param0 })
                    ON CREATE SET
                        this0_movies_connectOrCreate0.title = $this0_movies_connectOrCreate_param1
                    MERGE (this0)-[this0_movies_connectOrCreate_this0:ACTED_IN]->(this0_movies_connectOrCreate0)
                    ON CREATE SET
                        this0_movies_connectOrCreate_this0.screentime = $this0_movies_connectOrCreate_param2
                    RETURN count(*) AS _
                }
                RETURN this0
                }
                CALL {
                    WITH this0
                    RETURN this0 { .name } AS create_var0
                }
                RETURN [create_var0] AS data"
            `);

            expect(formatParams(result.params)).toMatchInlineSnapshot(`
                "{
                    \\"this0_name\\": \\"Tom Hanks\\",
                    \\"this0_movies_connectOrCreate_param0\\": \\"The Terminal\\",
                    \\"this0_movies_connectOrCreate_param1\\": \\"The Terminal\\",
                    \\"this0_movies_connectOrCreate_param2\\": {
                        \\"low\\": 105,
                        \\"high\\": 0
                    },
                    \\"resolvedCallbacks\\": {}
                }"
            `);
        });

        test("Update with createOrConnect operation", async () => {
            const query = gql`
                mutation {
                    updateActors(
                        update: {
                            name: "Tom Hanks 2"
                            movies: {
                                connectOrCreate: {
                                    where: { node: { title: "The Terminal" } }
                                    onCreate: { edge: { screentime: 105 }, node: { title: "The Terminal" } }
                                }
                            }
                        }
                        where: { name: "Tom Hanks" }
                    ) {
                        actors {
                            name
                        }
                    }
                }
            `;

            const result = await translateQuery(neoSchema, query);

            expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
                "MATCH (this:Actor)
                WHERE this.name = $param0
                SET this.name = $this_update_name
                WITH this
                CALL {
                    WITH this
                    MERGE (this_movies0_connectOrCreate0:Movie { title: $this_movies0_connectOrCreate_param0 })
                    ON CREATE SET
                        this_movies0_connectOrCreate0.title = $this_movies0_connectOrCreate_param1
                    MERGE (this)-[this_movies0_connectOrCreate_this0:ACTED_IN]->(this_movies0_connectOrCreate0)
                    ON CREATE SET
                        this_movies0_connectOrCreate_this0.screentime = $this_movies0_connectOrCreate_param2
                    RETURN count(*) AS _
                }
                RETURN collect(DISTINCT this { .name }) AS data"
            `);

            expect(formatParams(result.params)).toMatchInlineSnapshot(`
                "{
                    \\"param0\\": \\"Tom Hanks\\",
                    \\"this_update_name\\": \\"Tom Hanks 2\\",
                    \\"this_movies0_connectOrCreate_param0\\": \\"The Terminal\\",
                    \\"this_movies0_connectOrCreate_param1\\": \\"The Terminal\\",
                    \\"this_movies0_connectOrCreate_param2\\": {
                        \\"low\\": 105,
                        \\"high\\": 0
                    },
                    \\"resolvedCallbacks\\": {}
                }"
            `);
        });
    });

    describe("Autogenerated field on created node", () => {
        let typeDefs: DocumentNode;
        let neoSchema: Neo4jGraphQL;

        beforeAll(() => {
            typeDefs = gql`
                type Movie {
                    id: ID! @id @unique
                    createdAt: DateTime! @timestamp(operations: [CREATE])
                    title: String! @unique
                    actors: [Actor!]! @relationship(type: "ACTED_IN", properties: "ActedIn", direction: IN)
                }

                type Actor {
                    name: String!
                    movies: [Movie!]! @relationship(type: "ACTED_IN", properties: "ActedIn", direction: OUT)
                }

                interface ActedIn @relationshipProperties {
                    screentime: Int!
                }
            `;

            neoSchema = new Neo4jGraphQL({
                typeDefs,
            });
        });

        test("Create with createOrConnect operation", async () => {
            const query = gql`
                mutation {
                    createActors(
                        input: [
                            {
                                name: "Tom Hanks"
                                movies: {
                                    connectOrCreate: {
                                        where: { node: { title: "The Terminal" } }
                                        onCreate: { edge: { screentime: 105 }, node: { title: "The Terminal" } }
                                    }
                                }
                            }
                        ]
                    ) {
                        actors {
                            name
                        }
                    }
                }
            `;

            const result = await translateQuery(neoSchema, query);

            expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
                "CALL {
                CREATE (this0:Actor)
                SET this0.name = $this0_name
                WITH this0
                CALL {
                    WITH this0
                    MERGE (this0_movies_connectOrCreate0:Movie { title: $this0_movies_connectOrCreate_param0 })
                    ON CREATE SET
                        this0_movies_connectOrCreate0.createdAt = datetime(),
                        this0_movies_connectOrCreate0.id = randomUUID(),
                        this0_movies_connectOrCreate0.title = $this0_movies_connectOrCreate_param1
                    MERGE (this0)-[this0_movies_connectOrCreate_this0:ACTED_IN]->(this0_movies_connectOrCreate0)
                    ON CREATE SET
                        this0_movies_connectOrCreate_this0.screentime = $this0_movies_connectOrCreate_param2
                    RETURN count(*) AS _
                }
                RETURN this0
                }
                CALL {
                    WITH this0
                    RETURN this0 { .name } AS create_var0
                }
                RETURN [create_var0] AS data"
            `);

            expect(formatParams(result.params)).toMatchInlineSnapshot(`
                "{
                    \\"this0_name\\": \\"Tom Hanks\\",
                    \\"this0_movies_connectOrCreate_param0\\": \\"The Terminal\\",
                    \\"this0_movies_connectOrCreate_param1\\": \\"The Terminal\\",
                    \\"this0_movies_connectOrCreate_param2\\": {
                        \\"low\\": 105,
                        \\"high\\": 0
                    },
                    \\"resolvedCallbacks\\": {}
                }"
            `);
        });

        test("Create with createOrConnect operation - with @id in where", async () => {
            const query = gql`
                mutation {
                    createActors(
                        input: [
                            {
                                name: "Tom Hanks"
                                movies: {
                                    connectOrCreate: {
                                        where: { node: { id: "movieId" } }
                                        onCreate: { edge: { screentime: 105 }, node: { title: "The Terminal" } }
                                    }
                                }
                            }
                        ]
                    ) {
                        actors {
                            name
                        }
                    }
                }
            `;

            const result = await translateQuery(neoSchema, query);

            expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
                "CALL {
                CREATE (this0:Actor)
                SET this0.name = $this0_name
                WITH this0
                CALL {
                    WITH this0
                    MERGE (this0_movies_connectOrCreate0:Movie { id: $this0_movies_connectOrCreate_param0 })
                    ON CREATE SET
                        this0_movies_connectOrCreate0.createdAt = datetime(),
                        this0_movies_connectOrCreate0.title = $this0_movies_connectOrCreate_param1
                    MERGE (this0)-[this0_movies_connectOrCreate_this0:ACTED_IN]->(this0_movies_connectOrCreate0)
                    ON CREATE SET
                        this0_movies_connectOrCreate_this0.screentime = $this0_movies_connectOrCreate_param2
                    RETURN count(*) AS _
                }
                RETURN this0
                }
                CALL {
                    WITH this0
                    RETURN this0 { .name } AS create_var0
                }
                RETURN [create_var0] AS data"
            `);

            expect(formatParams(result.params)).toMatchInlineSnapshot(`
                "{
                    \\"this0_name\\": \\"Tom Hanks\\",
                    \\"this0_movies_connectOrCreate_param0\\": \\"movieId\\",
                    \\"this0_movies_connectOrCreate_param1\\": \\"The Terminal\\",
                    \\"this0_movies_connectOrCreate_param2\\": {
                        \\"low\\": 105,
                        \\"high\\": 0
                    },
                    \\"resolvedCallbacks\\": {}
                }"
            `);
        });

        test("Update with createOrConnect operation", async () => {
            const query = gql`
                mutation {
                    updateActors(
                        update: {
                            name: "Tom Hanks 2"
                            movies: {
                                connectOrCreate: {
                                    where: { node: { title: "The Terminal" } }
                                    onCreate: { edge: { screentime: 105 }, node: { title: "The Terminal" } }
                                }
                            }
                        }
                        where: { name: "Tom Hanks" }
                    ) {
                        actors {
                            name
                        }
                    }
                }
            `;

            const result = await translateQuery(neoSchema, query);

            expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
                "MATCH (this:Actor)
                WHERE this.name = $param0
                SET this.name = $this_update_name
                WITH this
                CALL {
                    WITH this
                    MERGE (this_movies0_connectOrCreate0:Movie { title: $this_movies0_connectOrCreate_param0 })
                    ON CREATE SET
                        this_movies0_connectOrCreate0.createdAt = datetime(),
                        this_movies0_connectOrCreate0.id = randomUUID(),
                        this_movies0_connectOrCreate0.title = $this_movies0_connectOrCreate_param1
                    MERGE (this)-[this_movies0_connectOrCreate_this0:ACTED_IN]->(this_movies0_connectOrCreate0)
                    ON CREATE SET
                        this_movies0_connectOrCreate_this0.screentime = $this_movies0_connectOrCreate_param2
                    RETURN count(*) AS _
                }
                RETURN collect(DISTINCT this { .name }) AS data"
            `);

            expect(formatParams(result.params)).toMatchInlineSnapshot(`
                "{
                    \\"param0\\": \\"Tom Hanks\\",
                    \\"this_update_name\\": \\"Tom Hanks 2\\",
                    \\"this_movies0_connectOrCreate_param0\\": \\"The Terminal\\",
                    \\"this_movies0_connectOrCreate_param1\\": \\"The Terminal\\",
                    \\"this_movies0_connectOrCreate_param2\\": {
                        \\"low\\": 105,
                        \\"high\\": 0
                    },
                    \\"resolvedCallbacks\\": {}
                }"
            `);
        });

        test("Update with createOrConnect operation - with @id in where", async () => {
            const query = gql`
                mutation {
                    updateActors(
                        update: {
                            name: "Tom Hanks 2"
                            movies: {
                                connectOrCreate: {
                                    where: { node: { id: "movieId" } }
                                    onCreate: { edge: { screentime: 105 }, node: { title: "The Terminal" } }
                                }
                            }
                        }
                        where: { name: "Tom Hanks" }
                    ) {
                        actors {
                            name
                        }
                    }
                }
            `;

            const result = await translateQuery(neoSchema, query);

            expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
                "MATCH (this:Actor)
                WHERE this.name = $param0
                SET this.name = $this_update_name
                WITH this
                CALL {
                    WITH this
                    MERGE (this_movies0_connectOrCreate0:Movie { id: $this_movies0_connectOrCreate_param0 })
                    ON CREATE SET
                        this_movies0_connectOrCreate0.createdAt = datetime(),
                        this_movies0_connectOrCreate0.title = $this_movies0_connectOrCreate_param1
                    MERGE (this)-[this_movies0_connectOrCreate_this0:ACTED_IN]->(this_movies0_connectOrCreate0)
                    ON CREATE SET
                        this_movies0_connectOrCreate_this0.screentime = $this_movies0_connectOrCreate_param2
                    RETURN count(*) AS _
                }
                RETURN collect(DISTINCT this { .name }) AS data"
            `);

            expect(formatParams(result.params)).toMatchInlineSnapshot(`
                "{
                    \\"param0\\": \\"Tom Hanks\\",
                    \\"this_update_name\\": \\"Tom Hanks 2\\",
                    \\"this_movies0_connectOrCreate_param0\\": \\"movieId\\",
                    \\"this_movies0_connectOrCreate_param1\\": \\"The Terminal\\",
                    \\"this_movies0_connectOrCreate_param2\\": {
                        \\"low\\": 105,
                        \\"high\\": 0
                    },
                    \\"resolvedCallbacks\\": {}
                }"
            `);
        });
    });

    describe("Autogenerated field on created relationship", () => {
        let typeDefs: DocumentNode;
        let neoSchema: Neo4jGraphQL;

        beforeAll(() => {
            typeDefs = gql`
                type Movie {
                    title: String! @unique
                    actors: [Actor!]! @relationship(type: "ACTED_IN", properties: "ActedIn", direction: IN)
                }

                type Actor {
                    name: String!
                    movies: [Movie!]! @relationship(type: "ACTED_IN", properties: "ActedIn", direction: OUT)
                }

                interface ActedIn @relationshipProperties {
                    id: ID! @id
                    createdAt: DateTime! @timestamp(operations: [CREATE])
                    updatedAt: DateTime @timestamp(operations: [UPDATE])
                    screentime: Int!
                }
            `;

            neoSchema = new Neo4jGraphQL({
                typeDefs,
            });
        });

        test("Create with createOrConnect operation", async () => {
            const query = gql`
                mutation {
                    createActors(
                        input: [
                            {
                                name: "Tom Hanks"
                                movies: {
                                    connectOrCreate: {
                                        where: { node: { title: "The Terminal" } }
                                        onCreate: { edge: { screentime: 105 }, node: { title: "The Terminal" } }
                                    }
                                }
                            }
                        ]
                    ) {
                        actors {
                            name
                        }
                    }
                }
            `;

            const result = await translateQuery(neoSchema, query);

            expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
                "CALL {
                CREATE (this0:Actor)
                SET this0.name = $this0_name
                WITH this0
                CALL {
                    WITH this0
                    MERGE (this0_movies_connectOrCreate0:Movie { title: $this0_movies_connectOrCreate_param0 })
                    ON CREATE SET
                        this0_movies_connectOrCreate0.title = $this0_movies_connectOrCreate_param1
                    MERGE (this0)-[this0_movies_connectOrCreate_this0:ACTED_IN]->(this0_movies_connectOrCreate0)
                    ON CREATE SET
                        this0_movies_connectOrCreate_this0.createdAt = datetime(),
                        this0_movies_connectOrCreate_this0.id = randomUUID(),
                        this0_movies_connectOrCreate_this0.screentime = $this0_movies_connectOrCreate_param2
                    RETURN count(*) AS _
                }
                RETURN this0
                }
                CALL {
                    WITH this0
                    RETURN this0 { .name } AS create_var0
                }
                RETURN [create_var0] AS data"
            `);

            expect(formatParams(result.params)).toMatchInlineSnapshot(`
                "{
                    \\"this0_name\\": \\"Tom Hanks\\",
                    \\"this0_movies_connectOrCreate_param0\\": \\"The Terminal\\",
                    \\"this0_movies_connectOrCreate_param1\\": \\"The Terminal\\",
                    \\"this0_movies_connectOrCreate_param2\\": {
                        \\"low\\": 105,
                        \\"high\\": 0
                    },
                    \\"resolvedCallbacks\\": {}
                }"
            `);
        });

        test("Update with createOrConnect operation", async () => {
            const query = gql`
                mutation {
                    updateActors(
                        update: {
                            name: "Tom Hanks 2"
                            movies: {
                                connectOrCreate: {
                                    where: { node: { title: "The Terminal" } }
                                    onCreate: { edge: { screentime: 105 }, node: { title: "The Terminal" } }
                                }
                            }
                        }
                        where: { name: "Tom Hanks" }
                    ) {
                        actors {
                            name
                        }
                    }
                }
            `;

            const result = await translateQuery(neoSchema, query);

            expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
                "MATCH (this:Actor)
                WHERE this.name = $param0
                SET this.name = $this_update_name
                WITH this
                CALL {
                    WITH this
                    MERGE (this_movies0_connectOrCreate0:Movie { title: $this_movies0_connectOrCreate_param0 })
                    ON CREATE SET
                        this_movies0_connectOrCreate0.title = $this_movies0_connectOrCreate_param1
                    MERGE (this)-[this_movies0_connectOrCreate_this0:ACTED_IN]->(this_movies0_connectOrCreate0)
                    ON CREATE SET
                        this_movies0_connectOrCreate_this0.createdAt = datetime(),
                        this_movies0_connectOrCreate_this0.id = randomUUID(),
                        this_movies0_connectOrCreate_this0.screentime = $this_movies0_connectOrCreate_param2
                    RETURN count(*) AS _
                }
                RETURN collect(DISTINCT this { .name }) AS data"
            `);

            expect(formatParams(result.params)).toMatchInlineSnapshot(`
                "{
                    \\"param0\\": \\"Tom Hanks\\",
                    \\"this_update_name\\": \\"Tom Hanks 2\\",
                    \\"this_movies0_connectOrCreate_param0\\": \\"The Terminal\\",
                    \\"this_movies0_connectOrCreate_param1\\": \\"The Terminal\\",
                    \\"this_movies0_connectOrCreate_param2\\": {
                        \\"low\\": 105,
                        \\"high\\": 0
                    },
                    \\"resolvedCallbacks\\": {}
                }"
            `);
        });
    });
});
