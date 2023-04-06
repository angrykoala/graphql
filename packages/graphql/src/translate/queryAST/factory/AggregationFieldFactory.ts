import type { ResolveTree } from "graphql-parse-resolve-info";
import type { Attribute } from "../../../schema-model/attribute/Attribute";
import type { Relationship } from "../../../schema-model/relationship/Relationship";
import { CountField } from "../ast/projection/aggregations/fields/CountField";
import { AggregationDatetimeSelectionSet } from "../ast/projection/aggregations/fields/AggregationDatetimeSelectionSet";
import { AggregationNumberSelectionSet } from "../ast/projection/aggregations/fields/AggregationNumberSelectionSet";
import { AggregationStringSelectionSet } from "../ast/projection/aggregations/fields/AggregationStringSelectionSet";

export class AggregationFieldFactory {
    public generateCountField(resolveTree: ResolveTree, directed: boolean, relationship: Relationship): CountField {
        return new CountField({
            alias: resolveTree.alias,
            directed,
            relationship,
        });
    }

    public generateAggregationAttributeSelectionSet(attribute: Attribute, value: ResolveTree): any {
        switch (attribute.type) {
            case "String": {
                const fields =
                    value.fieldsByTypeName["StringAggregateSelectionNullable"] ||
                    value.fieldsByTypeName["StringAggregateSelectionNonNullable"];
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
            case "Int": {
                const fields =
                    value.fieldsByTypeName["IntAggregateSelectionNullable"] ||
                    value.fieldsByTypeName["IntAggregateSelectionNonNullable"];

                return new AggregationNumberSelectionSet({
                    alias: value.alias,
                    attribute,
                });
            }
            case "DateTime": {
                const fields =
                    value.fieldsByTypeName["DateTimeAggregateSelectionNullable"] ||
                    value.fieldsByTypeName["DateTimeAggregateSelectionNonNullable"];
                return new AggregationDatetimeSelectionSet({
                    alias: value.alias,
                    attribute,
                });
                break;
            }
            default:
                throw new Error(`Type ${attribute.type} not found in ${value.name}`);
        }
    }
}
