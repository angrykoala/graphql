import Cypher from "@neo4j/cypher-builder";
import type { ConcreteEntity } from "../../../../schema-model/entity/ConcreteEntity";
import type { Relationship } from "../../../../schema-model/relationship/Relationship";
import type { ProjectionField } from "../../types";
import { directionToCypher } from "../../utils";
import type { Filter } from "../filters/Filter";
import type { Pagination } from "../pagination/Pagination";
import { QueryASTNode } from "../QueryASTNode";
import type { Sort } from "../sort/Sort";
import type { SelectionSetField } from "./SelectionSetField";

export class RelationshipField extends QueryASTNode {
    private relationship: Relationship;
    private alias: string;
    private directed: boolean;
    private selectionSet: SelectionSetField[] = [];
    private filters: Filter[] = [];
    private sortFields: Sort[] = [];
    private pagination: Pagination | undefined;

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

    public addSort(...sort: Sort[]): void {
        this.sortFields.push(...sort);
    }
    public addPagination(pagination: Pagination): void {
        this.pagination = pagination;
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
        const subqueries = this.selectionSet.flatMap((field) => field.getSubqueries(relatedNode));

        const projectionMap = new Cypher.MapProjection(relatedNode);
        for (const field of projectionFields) {
            projectionMap.set(field);
        }

        const mapIntermediateProjection = relatedNode; // NOTE: Reusing same node just to avoid breaking TCK on refactor
        const withClause = new Cypher.With([projectionMap, mapIntermediateProjection]);
        if (this.sortFields.length > 0) {
            this.addSortToClause(relatedNode, withClause);
        }

        let returnExpr: Cypher.Expr = Cypher.collect(mapIntermediateProjection);
        if (this.relationship.cardinality === "1") {
            returnExpr = Cypher.head(returnExpr);
        }

        const withReturn = withClause.return([returnExpr, this.projectionVariable]);

        const nestedQuery = Cypher.concat(match, ...subqueries, withReturn);

        return [new Cypher.Call(nestedQuery).innerWith(parentNode)];
    }

    private addSortToClause(node: Cypher.Node, clause: Cypher.With | Cypher.Return): void {
        const orderByFields = this.sortFields.flatMap((f) => f.getSortFields(node));
        const pagination = this.pagination ? this.pagination.getPagination() : undefined;
        clause.orderBy(...orderByFields);

        if (pagination?.skip) {
            clause.skip(pagination.skip);
        }
        if (pagination?.limit) {
            clause.limit(pagination.limit);
        }
    }
}
