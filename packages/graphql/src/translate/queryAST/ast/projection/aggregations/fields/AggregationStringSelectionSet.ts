import Cypher from "@neo4j/cypher-builder";
import type { Attribute } from "../../../../../../schema-model/attribute/Attribute";
import type { ProjectionField } from "../../../QueryASTNode";
import { QueryASTNode } from "../../../QueryASTNode";

type AggregationStringField = {
    alias: string;
};

export class AggregationStringSelectionSet extends QueryASTNode {
    private longest: AggregationStringField | undefined;
    private shortest: AggregationStringField | undefined;
    private attribute: Attribute;
    private alias: string;

    private stringAggregationVar = new Cypher.Variable();

    constructor({
        alias,
        attribute,
        longest,
        shortest,
    }: {
        alias: string;
        attribute: Attribute;
        longest: AggregationStringField | undefined;
        shortest: AggregationStringField | undefined;
    }) {
        super();
        this.attribute = attribute;
        this.longest = longest;
        this.shortest = shortest;
        this.alias = alias;
    }

    public getSubqueries(node: Cypher.Node): Cypher.Clause[] {
        const property = node.property(this.attribute.name);
        const listVar = new Cypher.NamedVariable("list");

        const returnMap = new Cypher.Map({
            longest: Cypher.head(listVar),
            shortest: Cypher.last(listVar),
        });

        return [
            new Cypher.With(node)
                .orderBy([Cypher.size(property), "DESC"])
                .with([Cypher.collect(property), listVar])
                .return([returnMap, this.stringAggregationVar]),
        ];
    }

    public getProjectionFields(variable: Cypher.Variable): ProjectionField[] {
        return [
            {
                [this.alias]: this.stringAggregationVar,
            },
        ];
    }
}
