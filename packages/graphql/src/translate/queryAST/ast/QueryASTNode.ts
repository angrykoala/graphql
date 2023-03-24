import type Cypher from "@neo4j/cypher-builder";

export type ProjectionField = string | Record<string, Cypher.Expr>;

export abstract class QueryASTNode {
    protected children: QueryASTNode[];

    constructor(children: QueryASTNode[]) {
        this.children = children;
    }
}
