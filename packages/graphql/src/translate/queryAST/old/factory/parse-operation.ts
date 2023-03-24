import Cypher from "@neo4j/cypher-builder";
import { Attribute } from "../../../schema-model/attribute/Attribute";
import type {
    ArrayWhereOperator,
    NumericalWhereOperator,
    RegexWhereOperator,
    RelationshipWhereOperator,
    SpatialWhereOperator,
    StringWhereOperator,
} from "../../where/types";

export type WhereOperator =
    | NumericalWhereOperator
    | SpatialWhereOperator
    | StringWhereOperator
    | RegexWhereOperator
    | ArrayWhereOperator
    | RelationshipWhereOperator;

export type WhereRegexGroups = {
    fieldName: string;
    isAggregate: boolean;
    operator: WhereOperator | undefined;
    prefix?: string;
    isNot: boolean;
    isConnection: boolean;
};

export type ProjectionRegexGroups = {
    fieldName: string;
    isConnection: boolean;
};

export const whereRegEx =
    /(?<prefix>\w*\.)?(?<fieldName>[_A-Za-z]\w*?)(?<isConnection>Connection)?(?<isAggregate>Aggregate)?(?:_(?<operator>NOT|NOT_IN|IN|NOT_INCLUDES|INCLUDES|MATCHES|NOT_CONTAINS|CONTAINS|NOT_STARTS_WITH|STARTS_WITH|NOT_ENDS_WITH|ENDS_WITH|LT|LTE|GT|GTE|DISTANCE|ALL|NONE|SINGLE|SOME))?$/;

const projectionRegex = /(?<fieldName>[_A-Za-z]\w*?)(?<isConnection>Connection)?$/;

export function parseProjectionField(field: string): ProjectionRegexGroups {
    const match = projectionRegex.exec(field);
    const matchGroups = match?.groups as {
        fieldName: string;
        isConnection?: string;
    };
    return {
        fieldName: matchGroups.fieldName,
        isConnection: Boolean(matchGroups.isConnection),
    };
}

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

export function createBaseOperation({
    operator,
    property,
    param,
}: {
    operator: WhereOperator | "EQ";
    property: Cypher.Expr;
    param: Cypher.Param;
}): Cypher.ComparisonOp {
    switch (operator) {
        case "LT":
            return Cypher.lt(property, param);
        case "LTE":
            return Cypher.lte(property, param);
        case "GT":
            return Cypher.gt(property, param);
        case "GTE":
            return Cypher.gte(property, param);
        case "ENDS_WITH":
            return Cypher.endsWith(property, param);
        case "STARTS_WITH":
            return Cypher.startsWith(property, param);
        case "MATCHES":
            return Cypher.matches(property, param);
        case "CONTAINS":
            return Cypher.contains(property, param);
        case "IN":
            return Cypher.in(property, param);
        case "INCLUDES":
            return Cypher.in(param, property);
        case "EQ":
            return Cypher.eq(property, param);
        default:
            throw new Error(`Invalid operator ${operator}`);
    }
}

export function createPointOperation({
    operator,
    property,
    param,
    attribute,
}: {
    operator: WhereOperator | "EQ";
    property: Cypher.Expr;
    param: Cypher.Param;
    attribute: Attribute;
}): Cypher.ComparisonOp {
    const pointDistance = createPointDistanceExpression(property, param);
    const distanceRef = param.property("distance");
    const isArray = attribute.isArray;

    switch (operator || "EQ") {
        case "LT":
            return Cypher.lt(pointDistance, distanceRef);
        case "LTE":
            return Cypher.lte(pointDistance, distanceRef);
        case "GT":
            return Cypher.gt(pointDistance, distanceRef);
        case "GTE":
            return Cypher.gte(pointDistance, distanceRef);
        case "DISTANCE":
            return Cypher.eq(pointDistance, distanceRef);
        case "EQ": {
            if (isArray) {
                const pointList = createPointListComprehension(param);
                return Cypher.eq(property, pointList);
            }

            return Cypher.eq(property, Cypher.point(param));
        }
        case "IN": {
            const pointList = createPointListComprehension(param);
            return Cypher.in(property, pointList);
        }
        case "INCLUDES":
            return Cypher.in(Cypher.point(param), property);
        default:
            throw new Error(`Invalid operator ${operator}`);
    }
}

function createPointListComprehension(param: Cypher.Param): Cypher.ListComprehension {
    const comprehensionVar = new Cypher.Variable();
    const mapPoint = Cypher.point(comprehensionVar);
    return new Cypher.ListComprehension(comprehensionVar, param).map(mapPoint);
}

function createPointDistanceExpression(property: Cypher.Expr, param: Cypher.Param): Cypher.Function {
    const nestedPointRef = param.property("point");
    return Cypher.pointDistance(property, Cypher.point(nestedPointRef));
}

// function createPointDistanceExpression(
//     property: Cypher.Expr,
//     param: Cypher.Param,
//     neo4jDatabaseInfo: Neo4jDatabaseInfo
// ): Cypher.Function {
//     const nestedPointRef = param.property("point");
//     if (neo4jDatabaseInfo.gte("4.4")) {
//         return Cypher.pointDistance(property, Cypher.point(nestedPointRef));
//     }
//     return Cypher.distance(property, Cypher.point(nestedPointRef));
// }
