import Cypher from "@neo4j/cypher-builder";
import type { ConcreteEntity } from "../../../../schema-model/entity/ConcreteEntity";
import type { Relationship } from "../../../../schema-model/relationship/Relationship";
import type { ProjectionField } from "../../types";
import { directionToCypher } from "../../utils";
import type { Filter } from "../filters/Filter";
import { QueryASTNode } from "../QueryASTNode";
import type { SelectionSetField } from "./SelectionSetField";

export class RelationshipField extends QueryASTNode {
    private relationship: Relationship;
    private alias: string;
    private directed: boolean;
    private selectionSet: SelectionSetField[] = [];
    private filters: Filter[] = [];

    private projectionVariable = new Cypher.Variable();

    constructor({
        relationship,
        alias,
        directed,
        selectionSetFields,
        filters,
    }: {
        relationship: Relationship;
        alias: string;
        directed: boolean;
        selectionSetFields: Array<SelectionSetField>;
        filters: Filter[];
    }) {
        super();
        this.relationship = relationship;
        this.alias = alias;
        this.directed = directed;
        this.selectionSet = selectionSetFields;
        this.filters = filters;
    }

    public getProjectionFields(_variable: Cypher.Variable): ProjectionField[] {
        return [{ [this.alias]: this.projectionVariable }];
    }

    public getSubqueries(parentNode: Cypher.Node): Cypher.Clause[] {
        const relatedEntity = this.relationship.target as ConcreteEntity; // TODO: normal entities
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
            // .withoutVariable()
            .withDirection(directionToCypher(this.relationship.direction, this.directed))
            .to(relatedNode);

        const match = new Cypher.Match(pattern);

        const filters = this.filters.flatMap((f) => f.getPredicate(relatedNode));
        const andFilters = Cypher.and(...filters);
        if (andFilters) {
            match.where(andFilters);
        }

        const projectionFields = this.selectionSet.flatMap((field) => field.getProjectionFields(relatedNode));

        const projectionMap = new Cypher.MapProjection(relatedNode);
        for (const field of projectionFields) {
            projectionMap.set(field);
        }

        // const mapIntermediateProjection = new Cypher.Variable();
        const mapIntermediateProjection = relatedNode; // NOTE: Reusing same node just to avoid breaking TCK on refactor
        const projectionWith = match
            .with([projectionMap, mapIntermediateProjection])
            .return([Cypher.collect(mapIntermediateProjection), this.projectionVariable]);
        // TODO: nested Subqueries
        return [new Cypher.Call(projectionWith).innerWith(parentNode)];
    }
}
