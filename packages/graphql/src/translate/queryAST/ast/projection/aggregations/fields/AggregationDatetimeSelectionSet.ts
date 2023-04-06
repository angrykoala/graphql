import Cypher from "@neo4j/cypher-builder";
import type { Attribute } from "../../../../../../schema-model/attribute/Attribute";
import type { ProjectionField } from "../../../QueryASTNode";
import { QueryASTNode } from "../../../QueryASTNode";

export class AggregationDatetimeSelectionSet extends QueryASTNode {
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
        const property = node.property(this.attribute.name);
        const returnMap = new Cypher.Map({
            min: this.convertToDate(Cypher.min(property)),
            max: this.convertToDate(Cypher.max(property)),
        });

        return [new Cypher.Return([returnMap, this.stringAggregationVar])];
    }

    public getProjectionFields(variable: Cypher.Variable): ProjectionField[] {
        return [
            {
                [this.alias]: this.stringAggregationVar,
            },
        ];
    }

    private convertToDate(expr: Cypher.Expr): Cypher.Expr {
        return Cypher.apoc.date.convertFormat(expr, "iso_zoned_date_time", "iso_offset_date_time");
    }
}
