/*
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Cypher from "@neo4j/cypher-builder";
import type { ConcreteEntity } from "../../../schema-model/entity/ConcreteEntity";
import type { ProjectionField } from "../types";
import { createNodeFromEntity } from "../utils";
import type { Filter } from "./filters/Filter";
import { Pagination } from "./pagination/Pagination";
import type { SelectionSetField } from "./projection/SelectionSetField";
import type { Sort } from "./sort/Sort";

export class QueryAST {
    private entity: ConcreteEntity; // TODO: normal entities

    private filters: Filter[] = [];
    private selectionSet: SelectionSetField[] = [];
    private sortFields: Sort[] = [];
    private pagination: Pagination | undefined;

    constructor(entity: ConcreteEntity) {
        this.entity = entity;
    }

    public addFilters(...filter: Filter[]): void {
        this.filters.push(...filter);
    }

    public addSelectionSetFields(...selectionSetFields: SelectionSetField[]) {
        this.selectionSet.push(...selectionSetFields);
    }

    public addSort(...sort: Sort[]): void {
        this.sortFields.push(...sort);
    }
    public addPagination(pagination: Pagination): void {
        this.pagination = pagination;
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

        let withSortClause: Cypher.With | undefined;
        if (this.sortFields.length > 0) {
            withSortClause = this.createWithSortClause(node);
        }

        return Cypher.concat(match, ...subqueries, withSortClause, returnClause);
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

    private createWithSortClause(node: Cypher.Node): Cypher.With {
        const orderByFields = this.sortFields.flatMap((f) => f.getSortFields(node));
        const pagination = this.pagination ? this.pagination.getPagination() : undefined;
        const withSort = new Cypher.With("*").orderBy(...orderByFields);
        if (pagination?.skip) {
            withSort.skip(pagination.skip);
        }
        if (pagination?.limit) {
            withSort.limit(pagination.limit);
        }

        return withSort;
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
}
