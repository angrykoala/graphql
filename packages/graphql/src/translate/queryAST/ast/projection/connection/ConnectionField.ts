import Cypher from "@neo4j/cypher-builder";
import type { ConcreteEntity } from "../../../../../schema-model/entity/ConcreteEntity";
import type { Relationship } from "../../../../../schema-model/relationship/Relationship";
import { filterTruthy } from "../../../../../utils/utils";
import type { ProjectionField } from "../../../types";
import { directionToCypher } from "../../../utils";
import type { ConnectionNodeFilter } from "../../filters/connection/ConnectionNodeFilter";
import type { LogicalFilter } from "../../filters/LogicalFilter";
import type { PropertyFilter } from "../../filters/PropertyFilter";
import { QueryASTNode } from "../../QueryASTNode";
import type { AttributeField } from "../AttributeField";
import type { SelectionSetField } from "../SelectionSetField";

export class ConnectionField extends QueryASTNode {
    private relationship: Relationship;
    private alias: string;
    private directed: boolean;

    private nodeSelectionSet: SelectionSetField[];
    private edgeSelectionSet: AttributeField[];

    private targetNodeFilters: ConnectionNodeFilter[] = [];
    private relationshipFilters: Array<PropertyFilter | LogicalFilter> = [];

    private projectionVariable = new Cypher.Variable();

    constructor({
        relationship,
        alias,
        directed,
        nodeSelectionSet,
        edgeSelectionSet,
        targetNodeFilters,
    }: {
        relationship: Relationship;
        alias: string;
        directed: boolean;
        nodeSelectionSet: SelectionSetField[];
        edgeSelectionSet: AttributeField[];
        targetNodeFilters: ConnectionNodeFilter[];
    }) {
        super();
        this.relationship = relationship;
        this.alias = alias;
        this.directed = directed;
        this.nodeSelectionSet = nodeSelectionSet;
        this.edgeSelectionSet = edgeSelectionSet;
        this.targetNodeFilters = targetNodeFilters;
    }

    public getProjectionFields(_variable: Cypher.Variable): ProjectionField[] {
        return [{ [this.alias]: this.projectionVariable }];
    }

    public getSubqueries(parentNode: Cypher.Node): Cypher.Clause[] {
        const relatedEntity = this.relationship.target as ConcreteEntity;
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

        const nodePredicates = filterTruthy(this.targetNodeFilters.map((c) => c.getPredicate(relatedNode)));
        // const relPredicates = filterTruthy(this.relationshipFilters.map((c) => c.getPredicate(relationshipVar)));

        const andPredicate = Cypher.and(...nodePredicates);
        if (andPredicate) {
            match.where(andPredicate);
        }

        const nodeProjectionFields = this.nodeSelectionSet.flatMap((field) => {
            return field.getProjectionFields(relatedNode);
        });

        const nodeMap = new Cypher.Map();
        this.addFieldsToMap(nodeMap, relatedNode, nodeProjectionFields);

        const edgeProjection = new Cypher.Map();
        const edgeProjectionFields = this.edgeSelectionSet.flatMap((field) => {
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
                map.set(field, projectionVariable.property(field));
            } else {
                map.set(field);
            }
        }

        return map;
    }
}

// export class ConnectionProjectionFieldAST extends QueryASTNode {
//     private relationship: Relationship;
//     private alias: string;
//     private directed: boolean;
//     private nodeProjectionFields: Array<
//         ProjectionFieldAST | RelationshipProjectionFieldAST | ConnectionProjectionFieldAST
//     >;
//     private edgeProjectionFields: Array<ProjectionFieldAST>;
//     private nodeFilter: FilterAST | undefined;
//     private relationshipFilter: PropertyFilterAST | LogicalFilterAST | undefined;

//     private projectionVariable = new Cypher.Variable();

//     constructor({
//         relationship,
//         alias,
//         directed,
//         nodeProjectionFields,
//         edgeProjectionFields,
//         nodeFilter,
//         relationshipFilter,
//     }: {
//         relationship: Relationship;
//         alias: string;
//         directed: boolean;
//         nodeProjectionFields: Array<ProjectionFieldAST | RelationshipProjectionFieldAST | ConnectionProjectionFieldAST>;
//         edgeProjectionFields: Array<ProjectionFieldAST>;
//         nodeFilter: FilterAST | undefined;
//         relationshipFilter: PropertyFilterAST | LogicalFilterAST | undefined;
//     }) {
//         super();
//         this.relationship = relationship;
//         this.alias = alias;
//         this.directed = directed;
//         this.nodeProjectionFields = nodeProjectionFields;
//         this.edgeProjectionFields = edgeProjectionFields;
//         this.nodeFilter = nodeFilter;
//         this.relationshipFilter = relationshipFilter;
//     }

//     public getProjectionFields(_variable: Cypher.Variable): ProjectionField[] {
//         return [{ [this.alias]: this.projectionVariable }];
//     }

//     public getSubqueries(parentNode: Cypher.Node): Cypher.Clause[] {
//         const relatedEntity = this.relationship.target;
//         const relatedNode = new Cypher.Node({
//             labels: relatedEntity.labels,
//         });
//         const relationshipType = this.relationship.type;

//         const relationshipVar = new Cypher.Relationship({
//             type: relationshipType,
//         });

//         const pattern = new Cypher.Pattern(parentNode)
//             .withoutLabels()
//             .related(relationshipVar)
//             .withDirection(directionToCypher(this.relationship.direction, this.directed))
//             .to(relatedNode);

//         const match = new Cypher.Match(pattern);

//         // TODO: Nested subqueries

//         let nodePredicate: Cypher.Predicate | undefined;
//         let relPredicate: Cypher.Predicate | undefined;
//         if (this.nodeFilter) {
//             nodePredicate = this.nodeFilter.getPredicate(relatedNode);
//         }
//         if (this.relationshipFilter) {
//             relPredicate = this.relationshipFilter.getPredicate(relationshipVar);
//         }

//         const andPredicate = Cypher.and(...[nodePredicate, relPredicate]);
//         if (andPredicate) {
//             match.where(andPredicate);
//         }

//         const nodeProjectionFields = this.nodeProjectionFields.flatMap((field) => {
//             return field.getProjectionFields(relatedNode);
//         });

//         const nodeMap = new Cypher.Map();
//         this.addFieldsToMap(nodeMap, relatedNode, nodeProjectionFields);

//         const edgeProjection = new Cypher.Map();
//         const edgeProjectionFields = this.edgeProjectionFields.flatMap((field) => {
//             return field.getProjectionFields(relatedNode);
//         });
//         this.addFieldsToMap(edgeProjection, relationshipVar, edgeProjectionFields);
//         edgeProjection.set({
//             node: nodeMap,
//         });

//         // const edgeVar = new Cypher.NamedVariable("edge"); // TODO: remove name
//         const edgeVar = new Cypher.NamedVariable("edge"); // TODO: remove name
//         const edgesVar = new Cypher.NamedVariable("edges"); // TODO: remove name
//         const totalCountVar = new Cypher.NamedVariable("totalCount");

//         const projectionWith = match
//             .with([edgeProjection, edgeVar])
//             .with([Cypher.collect(edgeVar), edgesVar])
//             .with(edgesVar, [Cypher.size(edgesVar), totalCountVar])
//             .return([new Cypher.Map({ edges: edgesVar, totalCount: totalCountVar }), this.projectionVariable]);
//         // TODO: nested Subqueries
//         return [new Cypher.Call(projectionWith).innerWith(parentNode)];
//     }

//     private addFieldsToMap(
//         map: Cypher.Map,
//         projectionVariable: Cypher.Variable,
//         fields: ProjectionField[]
//     ): Cypher.Map {
//         for (const field of fields) {
//             if (typeof field === "string") {
//                 const fieldWithoutLeadingDot = field.substring(1);
//                 map.set(fieldWithoutLeadingDot, projectionVariable.property(fieldWithoutLeadingDot));
//             } else {
//                 map.set(field);
//             }
//         }

//         return map;
//     }
// }
