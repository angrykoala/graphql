import Cypher from "@neo4j/cypher-builder";
import { FilterAST } from "./FilterAST";

type LogicalOperation = "NOT" | "AND" | "OR";

export class LogicalFilterAST extends FilterAST {
    private operation: LogicalOperation;
    private filters: FilterAST[];

    constructor({ operation, filters }: { operation: LogicalOperation; filters: FilterAST[] }) {
        super();
        this.operation = operation;
        if (operation === "NOT" && filters.length > 1) {
            throw new Error("Cannot have NOT operator with multiple filters");
        }
        this.filters = filters;
    }

    // VisitPredicate
    public getPredicate(node: Cypher.Node | Cypher.Relationship | any): Cypher.Predicate | undefined {
        const predicates = this.filters.map((f) => f.getPredicate(node)); // TODO: fix relationship vs node predicates

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
    // Boolean
    // Property
    // relationship
    //...
}
