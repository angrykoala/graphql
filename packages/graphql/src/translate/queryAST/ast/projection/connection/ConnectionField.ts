import Cypher from "@neo4j/cypher-builder";
import type { ConcreteEntity } from "../../../../../schema-model/entity/ConcreteEntity";
import type { Relationship } from "../../../../../schema-model/relationship/Relationship";
import { filterTruthy } from "../../../../../utils/utils";
import type { ProjectionField } from "../../../types";
import { directionToCypher } from "../../../utils";
import type { ConnectionEdgeFilter } from "../../filters/connection/ConnectionEdgeFilter";
import type { ConnectionNodeFilter } from "../../filters/connection/ConnectionNodeFilter";
import { Pagination, PaginationField } from "../../pagination/Pagination";
import { QueryASTNode } from "../../QueryASTNode";
import { Sort } from "../../sort/Sort";
import type { AttributeField } from "../AttributeField";
import type { SelectionSetField } from "../SelectionSetField";

export class ConnectionField extends QueryASTNode {
    private relationship: Relationship;
    private alias: string;
    private directed: boolean;

    private nodeSelectionSet: SelectionSetField[];
    private edgeSelectionSet: AttributeField[];

    private targetNodeFilters: ConnectionNodeFilter[] = [];
    private relationshipFilters: ConnectionEdgeFilter[] = [];

    private sortFields: Sort[] = [];
    private pagination: Pagination | undefined;

    private projectionVariable = new Cypher.Variable();

    constructor({
        relationship,
        alias,
        directed,
        nodeSelectionSet,
        edgeSelectionSet,
        targetNodeFilters,
        targetEdgeFilters,
    }: {
        relationship: Relationship;
        alias: string;
        directed: boolean;
        nodeSelectionSet: SelectionSetField[];
        edgeSelectionSet: AttributeField[];
        targetNodeFilters: ConnectionNodeFilter[];
        targetEdgeFilters: ConnectionEdgeFilter[];
    }) {
        super();
        this.relationship = relationship;
        this.alias = alias;
        this.directed = directed;
        this.nodeSelectionSet = nodeSelectionSet;
        this.edgeSelectionSet = edgeSelectionSet;
        this.targetNodeFilters = targetNodeFilters;
        this.relationshipFilters = targetEdgeFilters;
    }

    public addSort(...sort: Sort[]): void {
        this.sortFields.push(...sort);
    }
    public addPagination(pagination: Pagination): void {
        this.pagination = pagination;
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
        const relPredicates = filterTruthy(this.relationshipFilters.map((c) => c.getPredicate(relationshipVar)));

        const andPredicate = Cypher.and(...relPredicates, ...nodePredicates);
        if (andPredicate) {
            match.where(andPredicate);
        }

        const nodeProjectionFields = this.nodeSelectionSet.flatMap((field) => {
            return field.getProjectionFields(relatedNode);
        });

        const nodeSelectionSetSubqueries = this.nodeSelectionSet.flatMap((field) => {
            return field.getSubqueries(relatedNode);
        });

        const nodeMap = new Cypher.Map();
        this.addFieldsToMap(nodeMap, relatedNode, nodeProjectionFields);

        if (nodeMap.size === 0) {
            nodeMap.set("__resolveType", new Cypher.Literal(relatedEntity.name));
            nodeMap.set("__id", Cypher.id(relatedNode));
        }

        const edgeProjection = new Cypher.Map();
        const edgeProjectionFields = this.edgeSelectionSet.flatMap((field) => {
            return field.getProjectionFields(relationshipVar);
        });

        this.addFieldsToMap(edgeProjection, relationshipVar, edgeProjectionFields);
        edgeProjection.set({
            node: nodeMap,
        });

        // const edgeVar = new Cypher.NamedVariable("edge"); // TODO: remove name
        const edgeVar = new Cypher.NamedVariable("edge"); // TODO: remove name
        const edgesVar = new Cypher.NamedVariable("edges"); // TODO: remove name
        const totalCountVar = new Cypher.NamedVariable("totalCount");

        const projectionWith = new Cypher.With([edgeProjection, edgeVar])
            .with([Cypher.collect(edgeVar), edgesVar])
            .with(edgesVar, [Cypher.size(edgesVar), totalCountVar]);

        let sortSubquery: Cypher.With | undefined;
        if (this.pagination) {
            const paginationField = this.pagination.getPagination();
            if (paginationField) {
                sortSubquery = this.getPaginationSubquery(edgesVar, paginationField);
                sortSubquery.addColumns(totalCountVar);
            }
        }

        const returnClause = new Cypher.Return([
            new Cypher.Map({ edges: edgesVar, totalCount: totalCountVar }),
            this.projectionVariable,
        ]);
        // TODO: nested Subqueries
        return [
            new Cypher.Call(
                Cypher.concat(match, ...nodeSelectionSetSubqueries, projectionWith, sortSubquery, returnClause)
            ).innerWith(parentNode),
        ];
    }

    private getPaginationSubquery(edgesVar: Cypher.Variable, paginationField: PaginationField): Cypher.With {
        const edgeVar = new Cypher.NamedVariable("edge");

        const subquery = new Cypher.Unwind([edgesVar, edgeVar]).with(edgeVar);
        if (paginationField.limit) {
            subquery.limit(paginationField.limit);
        }

        const returnVar = new Cypher.Variable();
        subquery.return([Cypher.collect(edgeVar), returnVar]);

        return new Cypher.Call(subquery).innerWith(edgesVar).with([returnVar, edgesVar]);
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
