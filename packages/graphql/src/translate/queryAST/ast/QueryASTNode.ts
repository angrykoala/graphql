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

import type Cypher from "@neo4j/cypher-builder";
import type { PaginationField } from "./pagination/Pagination";
import type { SortField } from "./sort/Sort";

export type ProjectionField = string | Record<string, Cypher.Expr>;

export abstract class QueryASTNode {
    public getPredicate(variable: Cypher.Variable): Cypher.Predicate | undefined {
        return undefined;
    }

    public getProjectionFields(variable: Cypher.Variable): ProjectionField[] {
        return [];
    }

    public getSubqueries(node: Cypher.Node): Cypher.Clause[] {
        return [];
    }

    public getSortFields(variable: Cypher.Variable): SortField[] {
        return [];
    }

    public getPagination(): PaginationField | undefined {
        return undefined;
    }
}
