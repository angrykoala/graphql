import Cypher from "@neo4j/cypher-builder";
import type { LogicalOperators } from "../../operators";
import { QueryASTNode } from "../QueryASTNode";
import type { Filter } from "./Filter";

export class LogicalFilter extends QueryASTNode {
    private operation: LogicalOperators;
    protected children: Filter[];

    constructor({ operation, filters }: { operation: LogicalOperators; filters: Filter[] }) {
        super();
        this.operation = operation;
        if (operation === "NOT" && filters.length > 1) {
            throw new Error("Cannot have NOT operator with multiple filters");
        }
        this.children = filters;
    }

    // VisitPredicate
    public getPredicate(node: Cypher.Node | Cypher.Relationship | any): Cypher.Predicate | undefined {
        const predicates = this.children.map((f) => f.getPredicate(node)); // TODO: fix relationship vs node predicates

        switch (this.operation) {
            case "NOT": {
                const predicate = predicates[0];
                if (!predicate) return undefined;
                return Cypher.not(predicate);
            }
            case "AND": {
                return Cypher.and(...predicates);
            }
            case "OR": {
                return Cypher.or(...predicates);
            }
        }
    }
}
