import Cypher from "@neo4j/cypher-builder";
import type { Relationship } from "../../../../../schema-model/relationship/Relationship";
import { QueryASTNode } from "../../QueryASTNode";
import { directionToCypher } from "../../../utils";
import type { FilterAST } from "../filter/FilterAST";
import type { LogicalFilterAST } from "../filter/LogicalFilter";
import type { PropertyFilterAST } from "../filter/PropertyFilterAST";
import type { ProjectionFieldAST } from "./ProjectionField";
import type { RelationshipProjectionFieldAST } from "./RelationshipProjectionField";

type ProjectionField = string | Record<string, Cypher.Expr>;

export class ConnectionProjectionFieldAST extends QueryASTNode {
    private relationship: Relationship;
    private alias: string;
    private directed: boolean;
    private nodeProjectionFields: Array<
        ProjectionFieldAST | RelationshipProjectionFieldAST | ConnectionProjectionFieldAST
    >;
    private edgeProjectionFields: Array<ProjectionFieldAST>;
    private nodeFilter: FilterAST | undefined;
    private relationshipFilter: PropertyFilterAST | LogicalFilterAST | undefined;

    private projectionVariable = new Cypher.Variable();

    constructor({
        relationship,
        alias,
        directed,
        nodeProjectionFields,
        edgeProjectionFields,
        nodeFilter,
        relationshipFilter,
    }: {
        relationship: Relationship;
        alias: string;
        directed: boolean;
        nodeProjectionFields: Array<ProjectionFieldAST | RelationshipProjectionFieldAST | ConnectionProjectionFieldAST>;
        edgeProjectionFields: Array<ProjectionFieldAST>;
        nodeFilter: FilterAST | undefined;
        relationshipFilter: PropertyFilterAST | LogicalFilterAST | undefined;
    }) {
        super();
        this.relationship = relationship;
        this.alias = alias;
        this.directed = directed;
        this.nodeProjectionFields = nodeProjectionFields;
        this.edgeProjectionFields = edgeProjectionFields;
        this.nodeFilter = nodeFilter;
        this.relationshipFilter = relationshipFilter;
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
            .withDirection(directionToCypher(this.relationship.direction, this.directed))
            .to(relatedNode);

        const match = new Cypher.Match(pattern);

        // TODO: Nested subqueries

        let nodePredicate: Cypher.Predicate | undefined;
        let relPredicate: Cypher.Predicate | undefined;
        if (this.nodeFilter) {
            nodePredicate = this.nodeFilter.getPredicate(relatedNode);
        }
        if (this.relationshipFilter) {
            relPredicate = this.relationshipFilter.getPredicate(relationshipVar);
        }

        const andPredicate = Cypher.and(...[nodePredicate, relPredicate]);
        if (andPredicate) {
            match.where(andPredicate);
        }

        const nodeProjectionFields = this.nodeProjectionFields.flatMap((field) => {
            return field.getProjectionFields(relatedNode);
        });

        const nodeMap = new Cypher.Map();
        this.addFieldsToMap(nodeMap, relatedNode, nodeProjectionFields);

        const edgeProjection = new Cypher.Map();
        const edgeProjectionFields = this.edgeProjectionFields.flatMap((field) => {
            return field.getProjectionFields(relatedNode);
        });
        this.addFieldsToMap(edgeProjection, relationshipVar, edgeProjectionFields);
        edgeProjection.set({
            node: nodeMap,
        });

        // const edgeVar = new Cypher.NamedVariable("edge"); // TODO: remove name
        const edgeVar = new Cypher.NamedVariable("edge"); // TODO: remove name
        const edgesVar = new Cypher.NamedVariable("edges"); // TODO: remove name
        const totalCountVar = new Cypher.NamedVariable("totalCount");

        const projectionWith = match
            .with([edgeProjection, edgeVar])
            .with([Cypher.collect(edgeVar), edgesVar])
            .with(edgesVar, [Cypher.size(edgesVar), totalCountVar])
            .return([new Cypher.Map({ edges: edgesVar, totalCount: totalCountVar }), this.projectionVariable]);
        // TODO: nested Subqueries
        return [new Cypher.Call(projectionWith).innerWith(parentNode)];
    }

    private addFieldsToMap(
        map: Cypher.Map,
        projectionVariable: Cypher.Variable,
        fields: ProjectionField[]
    ): Cypher.Map {
        for (const field of fields) {
            if (typeof field === "string") {
                const fieldWithoutLeadingDot = field.substring(1);
                map.set(fieldWithoutLeadingDot, projectionVariable.property(fieldWithoutLeadingDot));
            } else {
                map.set(field);
            }
        }

        return map;
    }
}
