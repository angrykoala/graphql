import type Cypher from "@neo4j/cypher-builder";
import { QueryASTNode } from "../../QueryASTNode";

export abstract class FilterAST extends QueryASTNode {
    abstract getPredicate(node: Cypher.Node): Cypher.Predicate | undefined;
}
