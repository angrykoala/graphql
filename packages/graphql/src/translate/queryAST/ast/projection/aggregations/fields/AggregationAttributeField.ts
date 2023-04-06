import type Cypher from "@neo4j/cypher-builder";
import { QueryASTNode } from "../../../QueryASTNode";

export abstract class AggregationAttributeField extends QueryASTNode {
    public abstract getProjectionFields(variable: Cypher.Variable): Record<string, Cypher.Expr>[];
}
