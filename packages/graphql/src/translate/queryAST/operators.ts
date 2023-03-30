import type { ValuesType } from "utility-types";

export type NumericalWhereOperator = "GT" | "GTE" | "LT" | "LTE";
export type SpatialWhereOperator = "DISTANCE";
export type StringWhereOperator = "CONTAINS" | "STARTS_WITH" | "ENDS_WITH";
export type RegexWhereOperator = "MATCHES";
export type ArrayWhereOperator = "IN" | "INCLUDES";

const RELATIONSHIP_OPERATORS = ["ALL", "NONE", "SINGLE", "SOME"] as const;

export type RelationshipWhereOperator = ValuesType<typeof RELATIONSHIP_OPERATORS>;

export type WhereOperator =
    | "NOT"
    | NumericalWhereOperator
    | SpatialWhereOperator
    | StringWhereOperator
    | `NOT_${StringWhereOperator}`
    | RegexWhereOperator
    | ArrayWhereOperator
    | `NOT_${ArrayWhereOperator}`
    | RelationshipWhereOperator;

export function isRelationshipOperator(operator: string): operator is RelationshipWhereOperator {
    return RELATIONSHIP_OPERATORS.includes(operator as any);
}

export type LogicalOperators = "NOT" | "AND" | "OR";
