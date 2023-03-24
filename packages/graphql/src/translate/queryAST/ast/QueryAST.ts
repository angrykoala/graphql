import Cypher from "@neo4j/cypher-builder";
import type { ConcreteEntity } from "../../../schema-model/entity/ConcreteEntity";
import { createNodeFromEntity, getOrThrow } from "../utils";
import type { FilterAST } from "./filter/FilterAST";
import type { ProjectionAST } from "./projection/Projection";
import { QueryASTNode } from "./QueryASTNode";

export class QueryAST {
    private entity: ConcreteEntity; // TODO: normal entities
    private children: QueryASTNode[] = [];

    constructor(entity: ConcreteEntity) {
        this.entity = entity;
    }

    public addFilter(filter: FilterAST): void {
        this.filters.push(filter);
    }

    public addProjection(projection: ProjectionAST) {
        this.projection = projection;
    }

    public transpile(varName?: string): Cypher.Clause {
        const node = createNodeFromEntity(this.entity, varName);
        const match = new Cypher.Match(node);

        const predicates = this.filters.map((c) => c.getPredicate(node));
        const andPredicate = Cypher.and(...predicates);

        if (andPredicate) {
            match.where(andPredicate);
        }

        const projection = getOrThrow(this.projection);
        const projectionField = projection.getProjectionFields(node);

        const projectionMap = new Cypher.MapProjection(node);
        for (const field of projectionField) {
            projectionMap.set(field);
        }

        let returnClause: Cypher.Return;
        if (varName) {
            returnClause = new Cypher.Return([projectionMap, varName]);
        } else {
            returnClause = new Cypher.Return(projectionMap);
        }

        const subqueries = this.getSubqueries(node);

        return Cypher.concat(match, ...subqueries, returnClause);
    }

    private getSubqueries(node: Cypher.Node): Cypher.Clause[] {
        const projection = getOrThrow(this.projection);
        return projection.getSubqueries(node);
    }
}
