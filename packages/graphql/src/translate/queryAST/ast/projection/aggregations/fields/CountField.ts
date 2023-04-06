import Cypher, { Return } from "@neo4j/cypher-builder";
import type { Node, Clause } from "@neo4j/cypher-builder/src";
import type { ConcreteEntity } from "../../../../../../schema-model/entity/ConcreteEntity";
import type { Relationship } from "../../../../../../schema-model/relationship/Relationship";
import { directionToCypher } from "../../../../utils";
import { QueryASTNode } from "../../../QueryASTNode";

// Note that CountField is not an attributeField
export class CountField extends QueryASTNode {
    private alias: string;
    private relationship: Relationship;
    private directed: boolean;

    private countVar = new Cypher.Variable();

    constructor({ alias, relationship, directed }: { alias: string; relationship: Relationship; directed: boolean }) {
        super();
        this.alias = alias;
        this.relationship = relationship;
        this.directed = directed;
    }

    public getSubqueries(relatedNode: Node): Clause[] {
        // const relatedEntity = this.relationship.target as ConcreteEntity; // TODO: normal entities
        // const relatedNode = new Cypher.Node({
        //     labels: relatedEntity.labels,
        // });
        // const relationshipType = this.relationship.type;

        // const relationshipVar = new Cypher.Relationship({
        //     type: relationshipType,
        // });

        // const pattern = new Cypher.Pattern(node)
        //     .withoutLabels()
        //     .related(relationshipVar)
        //     // .withoutVariable()
        //     .withDirection(directionToCypher(this.relationship.direction, this.directed))
        // .to(relatedNode);
        return [new Return([Cypher.count(relatedNode), this.countVar])];
        // const innerClause = new Cypher.Match(pattern).return([Cypher.count(relatedNode), this.countVar]);
        // return [new Cypher.Call(innerClause).innerWith(node)];
    }

    public getProjectionFields(_variable: Cypher.Variable): Array<Record<string, Cypher.Expr>> {
        return [
            {
                [this.alias]: this.countVar,
            },
        ];
    }
}
