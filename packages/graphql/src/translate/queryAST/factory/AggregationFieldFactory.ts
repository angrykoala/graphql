import type { ResolveTree } from "graphql-parse-resolve-info";
import type { Attribute } from "../../../schema-model/attribute/Attribute";
import { AggregationStringSelectionSet } from "../ast/projection/aggregations/fields/AggregationStringSelectionSet";
import { CountField } from "../ast/projection/aggregations/fields/CountField";

export class AggregationFieldFactory {
    public generateCountField(resolveTree: ResolveTree): CountField {
        return new CountField({
            alias: resolveTree.alias,
        });
    }

    public generateAggregationAttributeSelectionSet(attribute: Attribute, value: ResolveTree): any {
        switch (attribute.type) {
            case "String": {
                const fields = value.fieldsByTypeName["StringAggregateSelectionNullable"];
                const longestAlias = fields.longest?.alias;
                const shortestAlias = fields.shortest?.alias;

                const longestField = longestAlias ? { alias: longestAlias } : undefined;
                const shortestField = shortestAlias ? { alias: shortestAlias } : undefined;

                return new AggregationStringSelectionSet({
                    alias: value.alias,
                    attribute,
                    longest: longestField,
                    shortest: shortestField,
                });
            }
            default:
                throw new Error(`Type ${attribute.type} not found in ${value.name}`);
        }
    }
}
