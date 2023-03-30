import Cypher from "@neo4j/cypher-builder";
import type { ConcreteEntity } from "../../../../schema-model/entity/ConcreteEntity";
import type { Relationship } from "../../../../schema-model/relationship/Relationship";
import type { RelationshipWhereOperator } from "../../../where/types";
import { directionToCypher } from "../../utils";
import { QueryASTNode } from "../QueryASTNode";
import type { Filter } from "./Filter";

export class RelationshipFilter extends QueryASTNode {
    private targetNodeFilters: Filter[] = [];
    private relationship: Relationship;
    private operator: RelationshipWhereOperator;
    private isNot: boolean;

    constructor({
        relationship,
        operator,
        isNot,
    }: {
        relationship: Relationship;
        operator: RelationshipWhereOperator | undefined;
        isNot: boolean;
    }) {
        super();
        this.relationship = relationship;
        this.isNot = isNot;
        this.operator = operator || "SOME";
    }

    public addTargetNodeFilter(...filter: Filter[]): void {
        this.targetNodeFilters.push(...filter);
    }

    public getPredicate(parentNode: Cypher.Node): Cypher.Predicate | undefined {
        //TODO: not concrete entities
        const relatedEntity = this.relationship.target as ConcreteEntity;
        const relatedNode = new Cypher.Node({
            labels: relatedEntity.labels,
        });
        const relationshipType = this.relationship.type;

        const pattern = new Cypher.Pattern(parentNode)
            .withoutLabels()
            .related(
                new Cypher.Relationship({
                    type: relationshipType,
                })
            )
            .withDirection(directionToCypher(this.relationship.direction))
            .withoutVariable()
            .to(relatedNode);

        const predicate = this.createRelationshipOperation(pattern, relatedNode);
        if (!predicate) return undefined;
        return this.wrapInNotIfNeeded(predicate);
    }

    private createRelationshipOperation(
        pattern: Cypher.Pattern,
        relatedNode: Cypher.Node
    ): Cypher.Predicate | undefined {
        const predicates = this.targetNodeFilters.map((c) => c.getPredicate(relatedNode));
        const innerPredicate = Cypher.and(...predicates);

        if (!innerPredicate) return undefined;

        switch (this.operator) {
            case "ALL": {
                const match = new Cypher.Match(pattern).where(innerPredicate);
                const negativeMatch = new Cypher.Match(pattern).where(Cypher.not(innerPredicate));
                // Testing "ALL" requires testing that at least one element exists and that no elements not matching the filter exists
                return Cypher.and(new Cypher.Exists(match), Cypher.not(new Cypher.Exists(negativeMatch)));
            }
            case "SINGLE": {
                const patternComprehension = new Cypher.PatternComprehension(pattern, new Cypher.Literal(1)).where(
                    innerPredicate
                );
                return Cypher.single(relatedNode, patternComprehension, new Cypher.Literal(true));
                // const isArray = relationField.typeMeta.array;
                // const isRequired = relationField.typeMeta.required;

                // if (isArray || !isRequired) {
                //     const patternComprehension = new Cypher.PatternComprehension(
                //         matchPattern,
                //         new Cypher.Literal(1)
                //     ).where(innerOperation);
                //     return { predicate: Cypher.single(childNode, patternComprehension, new Cypher.Literal(true)) };
                // }

                // const matchStatement = new Cypher.Match(matchPattern);
                // return {
                //     predicate: innerOperation,
                //     preComputedSubqueries: Cypher.concat(matchStatement),
                // };
            }
            default: {
                const match = new Cypher.Match(pattern).where(innerPredicate);
                return new Cypher.Exists(match);
            }
        }
    }

    private wrapInNotIfNeeded(predicate: Cypher.Predicate): Cypher.Predicate {
        if (this.isNot) return Cypher.not(predicate);
        else return predicate;
    }
}
