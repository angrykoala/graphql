import type { LogicalOperators, WhereOperator } from "../../operators";

export type WhereRegexGroups = {
    fieldName: string;
    isAggregate: boolean;
    operator: WhereOperator | undefined;
    prefix?: string;
    isNot: boolean;
    isConnection: boolean;
};

export const whereRegEx =
    /(?<prefix>\w*\.)?(?<fieldName>[_A-Za-z]\w*?)(?<isConnection>Connection)?(?<isAggregate>Aggregate)?(?:_(?<operator>NOT|NOT_IN|IN|NOT_INCLUDES|INCLUDES|MATCHES|NOT_CONTAINS|CONTAINS|NOT_STARTS_WITH|STARTS_WITH|NOT_ENDS_WITH|ENDS_WITH|LT|LTE|GT|GTE|DISTANCE|ALL|NONE|SINGLE|SOME))?$/;

export function parseWhereField(field: string): WhereRegexGroups {
    const match = whereRegEx.exec(field);

    const matchGroups = match?.groups as {
        fieldName: string;
        isAggregate?: string;
        operator?: string;
        prefix?: string;
        isConnection?: string;
    };

    let isNot = false;
    let operator = undefined as WhereOperator | undefined;

    if (matchGroups.operator) {
        const notSplit = matchGroups.operator.split("NOT_");
        if (notSplit.length === 2) {
            isNot = true;
            operator = notSplit[1] as WhereOperator;
        } else if (matchGroups.operator === "NOT" || matchGroups.operator === "NONE") {
            isNot = true;
        } else {
            operator = notSplit[0] as WhereOperator;
        }
    }

    return {
        fieldName: matchGroups.fieldName,
        isAggregate: Boolean(matchGroups.isAggregate),
        operator,
        isNot,
        prefix: matchGroups.prefix,
        isConnection: Boolean(matchGroups.isConnection),
    };
}

type ConnectionWhereArgField = {
    isNot: boolean;
    fieldName: "node" | "edge" | LogicalOperators;
};

export function parseConnectionWhereFields(key: string): ConnectionWhereArgField {
    const splitKey = key.split("_NOT");
    const isNot = splitKey.length > 1;
    return {
        fieldName: splitKey[0] as "node" | "edge" | LogicalOperators,
        isNot,
    };
}
