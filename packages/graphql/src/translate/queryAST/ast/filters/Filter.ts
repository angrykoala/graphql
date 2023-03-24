import type Cypher from "@neo4j/cypher-builder";
import { QueryASTNode } from "../QueryASTNode";

export type ProjectionField = string | Record<string, Cypher.Expr>;

export class PropertyFilter extends QueryASTNode {
    constructor() {
        super([]);
    }
}

// export class PropertyFilterAST extends FilterAST {
//     private attribute: Attribute;
//     private comparison: any;
//     private operator: WhereOperator | undefined;
//     private isNot: boolean;

//     constructor({
//         attribute,
//         comparisonValue,
//         operator,
//         isNot,
//     }: {
//         attribute: Attribute;
//         comparisonValue: any;
//         operator: WhereOperator | undefined;
//         isNot: boolean;
//     }) {
//         super();
//         this.attribute = attribute;
//         this.comparison = comparisonValue;
//         this.operator = operator;
//         this.isNot = isNot;
//     }

//     // VisitPredicate
//     public getPredicate(node: Cypher.Node | Cypher.Relationship): Cypher.Predicate | undefined {
//         const nodeProperty = getPropertyFromAttribute(node, this.attribute);

//         if (this.comparison === null) {
//             return this.getNullPredicate(nodeProperty);
//         }

//         let baseOperation: Cypher.Predicate;
//         if (this.attribute.type === AttributeType.Point) {
//             baseOperation = createPointOperation({
//                 operator: this.operator || "EQ",
//                 property: nodeProperty,
//                 param: new Cypher.Param(this.comparison),
//                 attribute: this.attribute,
//             });
//         } else {
//             baseOperation = createBaseOperation({
//                 operator: this.operator || "EQ",
//                 property: nodeProperty,
//                 param: new Cypher.Param(this.comparison),
//             });
//         }

//         return this.wrapInNotIfNeeded(baseOperation);
//     }

//     private getNullPredicate(propertyRef: Cypher.PropertyRef): Cypher.Predicate {
//         if (this.isNot) {
//             return Cypher.isNotNull(propertyRef);
//         } else {
//             return Cypher.isNull(propertyRef);
//         }
//     }

//     private wrapInNotIfNeeded(predicate: Cypher.Predicate): Cypher.Predicate {
//         if (this.isNot) return Cypher.not(predicate);
//         else return predicate;
//     }
// }
