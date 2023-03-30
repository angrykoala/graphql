import type Cypher from "@neo4j/cypher-builder";

export type ProjectionField = string | Record<string, Cypher.Expr>;
