import Cypher from "@neo4j/cypher-builder";
import type { Attribute } from "../../../../../../schema-model/attribute/Attribute";
import { getPropertyFromAttribute } from "../../../../utils";
import { AggregationAttributeField } from "./AggregationAttributeField";

export class AggregationNumberSelectionSet extends AggregationAttributeField {
    private attribute: Attribute;
    private alias: string;

    // min,max,average,sum

    private stringAggregationVar = new Cypher.Variable();

    constructor({ alias, attribute }: { alias: string; attribute: Attribute }) {
        super();
        this.attribute = attribute;
        this.alias = alias;
    }

    public getSubqueries(node: Cypher.Node): Cypher.Clause[] {
        const property = getPropertyFromAttribute(node, this.attribute);

        const returnMap = new Cypher.Map({
            min: Cypher.min(property),
            max: Cypher.max(property),
            average: Cypher.avg(property),
            sum: Cypher.sum(property),
        });

        return [new Cypher.Return([returnMap, this.stringAggregationVar])];
    }

    public getProjectionFields(variable: Cypher.Variable): Record<string, Cypher.Expr>[] {
        return [
            {
                [this.alias]: this.stringAggregationVar,
            },
        ];
    }
}
