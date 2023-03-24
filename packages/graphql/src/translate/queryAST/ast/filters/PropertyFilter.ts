import Cypher from "@neo4j/cypher-builder";
import { Attribute, AttributeType } from "../../../../schema-model/attribute/Attribute";
import type { WhereOperator } from "../../../where/types";
import { getPropertyFromAttribute } from "../../utils";
import { QueryASTNode } from "../QueryASTNode";

export type ProjectionField = string | Record<string, Cypher.Expr>;

export class PropertyFilter extends QueryASTNode {
    private attribute: Attribute;
    private comparison: any;
    private operator: WhereOperator | undefined;
    private isNot: boolean;

    constructor({
        attribute,
        comparisonValue,
        operator,
        isNot,
    }: {
        attribute: Attribute;
        comparisonValue: any;
        operator: WhereOperator | undefined;
        isNot: boolean;
    }) {
        super();
        this.attribute = attribute;
        this.comparison = comparisonValue;
        this.operator = operator;
        this.isNot = isNot;
    }

    // Visit Predicate
    public getPredicate(node: Cypher.Variable): Cypher.Predicate | undefined {
        const nodeProperty = getPropertyFromAttribute(node, this.attribute);

        if (this.comparison === null) {
            return this.getNullPredicate(nodeProperty);
        }

        let baseOperation: Cypher.Predicate;
        if (this.attribute.type === AttributeType.Point) {
            baseOperation = createPointOperation({
                operator: this.operator || "EQ",
                property: nodeProperty,
                param: new Cypher.Param(this.comparison),
                attribute: this.attribute,
            });
        } else {
            baseOperation = createBaseOperation({
                operator: this.operator || "EQ",
                property: nodeProperty,
                param: new Cypher.Param(this.comparison),
            });
        }

        return this.wrapInNotIfNeeded(baseOperation);
    }

    private getNullPredicate(propertyRef: Cypher.PropertyRef): Cypher.Predicate {
        if (this.isNot) {
            return Cypher.isNotNull(propertyRef);
        } else {
            return Cypher.isNull(propertyRef);
        }
    }

    private wrapInNotIfNeeded(predicate: Cypher.Predicate): Cypher.Predicate {
        if (this.isNot) return Cypher.not(predicate);
        else return predicate;
    }
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
