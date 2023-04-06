import Cypher, { Return } from "@neo4j/cypher-builder";
import type { Node, Clause } from "@neo4j/cypher-builder/src";
import { QueryASTNode } from "../../../QueryASTNode";

export class CountField extends QueryASTNode {
    private alias: string;

    private countVar = new Cypher.Variable();

    constructor({ alias }: { alias: string }) {
        super();
        this.alias = alias;
    }

    public getSubqueries(relatedNode: Node): Clause[] {
        return [new Return([Cypher.count(relatedNode), this.countVar])];
    }

    public getProjectionFields(_variable: Cypher.Variable): Array<Record<string, Cypher.Expr>> {
        return [
            {
                [this.alias]: this.countVar,
            },
        ];
    }
}
