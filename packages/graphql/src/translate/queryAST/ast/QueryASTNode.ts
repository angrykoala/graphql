import type Cypher from "@neo4j/cypher-builder";

export type ProjectionField = string | Record<string, Cypher.Expr>;

export abstract class QueryASTNode {
    public getPredicate(variable: Cypher.Variable): Cypher.Predicate | undefined {
        return undefined;
    }

    public getProjectionFields(variable: Cypher.Variable): ProjectionField[] {
        return [];
    }

    public getSubqueries(node: Cypher.Node): Cypher.Clause[] {
        return [];
    }
}
