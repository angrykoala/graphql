import Cypher from "@neo4j/cypher-builder";
import { filterTruthy } from "../../../../utils/utils";
import type { LogicalOperators } from "../../operators";
import { QueryASTNode } from "../QueryASTNode";
import type { Filter } from "./Filter";

export class LogicalFilter extends QueryASTNode {
    private operation: LogicalOperators;
    protected children: Filter[];

    constructor({ operation, filters }: { operation: LogicalOperators; filters: Filter[] }) {
        super();
        this.operation = operation;
        this.children = filters;
    }

    // VisitPredicate
    public getPredicate(node: Cypher.Node | Cypher.Relationship | any): Cypher.Predicate | undefined {
        const predicates = filterTruthy(this.children.map((f) => f.getPredicate(node))); // TODO: fix relationship vs node predicates

        switch (this.operation) {
            case "NOT": {
                if (predicates.length === 0) return undefined;
                return Cypher.not(Cypher.and(...predicates));
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
