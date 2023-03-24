import Cypher from "@neo4j/cypher-builder";
import type { Relationship } from "../../../../schema-model/relationship/Relationship";
import { QueryASTNode } from "../../QueryASTNode";
import { directionToCypher } from "../../utils";
import type { ConnectionProjectionFieldAST } from "./ConnectionProjection";
import type { ProjectionFieldAST } from "./ProjectionField";

type ProjectionField = string | Record<string, Cypher.Expr>;

export class RelationshipProjectionFieldAST extends QueryASTNode {
    private relationship: Relationship;
    private alias: string;
    private directed: boolean;
    private projectionFields: Array<ProjectionFieldAST | RelationshipProjectionFieldAST | ConnectionProjectionFieldAST>;

    private projectionVariable = new Cypher.Variable();

    constructor({
        relationship,
        alias,
        directed,
        projectionFields,
    }: {
        relationship: Relationship;
        alias: string;
        directed: boolean;
        projectionFields: Array<ProjectionFieldAST | RelationshipProjectionFieldAST | ConnectionProjectionFieldAST>;
    }) {
        super();
        this.relationship = relationship;
        this.alias = alias;
        this.directed = directed;
        this.projectionFields = projectionFields;
    }

    public getProjectionFields(_variable: Cypher.Variable): ProjectionField[] {
        return [{ [this.alias]: this.projectionVariable }];
    }

    public getSubqueries(parentNode: Cypher.Node): Cypher.Clause[] {
        const relatedEntity = this.relationship.target;
        const relatedNode = new Cypher.Node({
            labels: relatedEntity.labels,
        });
        const relationshipType = this.relationship.type;

        const relationshipVar = new Cypher.Relationship({
            type: relationshipType,
        });

        const pattern = new Cypher.Pattern(parentNode)
            .withoutLabels()
            .related(relationshipVar)
            .withoutVariable()
            .withDirection(directionToCypher(this.relationship.direction, this.directed))
            .to(relatedNode);

        const match = new Cypher.Match(pattern);
        // get subqueries
        const projectionFields = this.projectionFields.flatMap((field) => field.getProjectionFields(relatedNode));

        const projectionMap = new Cypher.MapProjection(relatedNode);
        for (const field of projectionFields) {
            projectionMap.set(field);
        }

        const mapIntermediateProjection = new Cypher.Variable();
        const projectionWith = match
            .with([projectionMap, mapIntermediateProjection])
            .return([Cypher.collect(mapIntermediateProjection), this.projectionVariable]);
        // TODO: nested Subqueries
        return [new Cypher.Call(projectionWith).innerWith(parentNode)];
    }
}
