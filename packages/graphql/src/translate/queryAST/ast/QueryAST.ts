import Cypher from "@neo4j/cypher-builder";
import type { ConcreteEntity } from "../../../schema-model/entity/ConcreteEntity";
import type { ProjectionField } from "../types";
import { createNodeFromEntity } from "../utils";
import type { Filter } from "./filters/Filter";
import type { SelectionSetField } from "./projection/SelectionSetField";

export class QueryAST {
    private entity: ConcreteEntity; // TODO: normal entities

    private filters: Filter[] = [];
    private selectionSet: SelectionSetField[] = [];

    constructor(entity: ConcreteEntity) {
        this.entity = entity;
    }

    public addFilters(...filter: Filter[]): void {
        this.filters.push(...filter);
    }

    public addSelectionSetFields(...selectionSetFields: SelectionSetField[]) {
        this.selectionSet.push(...selectionSetFields);
    }

    public transpile(varName?: string): Cypher.Clause {
        const node = createNodeFromEntity(this.entity, varName);
        const match = new Cypher.Match(node);
        const predicates = this.filters.map((c) => c.getPredicate(node));
        const andPredicate = Cypher.and(...predicates);

        if (andPredicate) {
            match.where(andPredicate);
        }

        const projectionFields = this.getProjectionFields(node);
        const returnClause = this.getReturnClause(node, projectionFields, varName);

        const subqueries = this.getSubqueries(node);

        return Cypher.concat(match, ...subqueries, returnClause);
    }

    private getReturnClause(node: Cypher.Node, projectionFields: ProjectionField[], varName?: string): Cypher.Return {
        const projectionMap = new Cypher.MapProjection(node);
        for (const field of projectionFields) {
            projectionMap.set(field);
        }

        if (varName) {
            return new Cypher.Return([projectionMap, varName]);
        }
        return new Cypher.Return(projectionMap);
    }

    private getProjectionFields(node: Cypher.Node): ProjectionField[] {
        const projectionFields: ProjectionField[] = [];
        for (const selectionSetField of this.selectionSet) {
            const fields = selectionSetField.getProjectionFields(node);
            projectionFields.push(...fields);
        }
        return projectionFields;
    }

    private getSubqueries(node: Cypher.Node): Cypher.Clause[] {
        const subqueries: Cypher.Clause[] = [];
        this.selectionSet.forEach((field) => {
            subqueries.push(...field.getSubqueries(node));
        });

        return subqueries;
    }

    // public transpile(varName?: string): Cypher.Clause {
    //     const node = createNodeFromEntity(this.entity, varName);
    //     const match = new Cypher.Match(node);

    //     const predicates = this.filters.map((c) => c.getPredicate(node));
    //     const andPredicate = Cypher.and(...predicates);

    //     if (andPredicate) {
    //         match.where(andPredicate);
    //     }

    //     const projection = getOrThrow(this.projection);
    //     const projectionField = projection.getProjectionFields(node);

    //     const projectionMap = new Cypher.MapProjection(node);
    //     for (const field of projectionField) {
    //         projectionMap.set(field);
    //     }

    //     let returnClause: Cypher.Return;
    //     if (varName) {
    //         returnClause = new Cypher.Return([projectionMap, varName]);
    //     } else {
    //         returnClause = new Cypher.Return(projectionMap);
    //     }

    //     const subqueries = this.getSubqueries(node);

    //     return Cypher.concat(match, ...subqueries, returnClause);
    // }

    // private getSubqueries(node: Cypher.Node): Cypher.Clause[] {
    //     const projection = getOrThrow(this.projection);
    //     return projection.getSubqueries(node);
    // }
}
