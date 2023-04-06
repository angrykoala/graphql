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
import type { Node, Clause } from "@neo4j/cypher-builder/src";
import type { ConcreteEntity } from "../../../../../schema-model/entity/ConcreteEntity";
import type { Relationship } from "../../../../../schema-model/relationship/Relationship";
import { directionToCypher } from "../../../utils";
import { QueryASTNode } from "../../QueryASTNode";
import type { ProjectionField } from "../../QueryASTNode";
import type { AggregationField, AggregationNodeField } from "./fields/AggregationField";

export class AggregationSelectionSet extends QueryASTNode {
    private relationship: Relationship;
    private alias: string;
    private directed: boolean;

    private fields: AggregationField[] = [];
    private nodeFields: AggregationField[] = [];

    constructor({ relationship, alias, directed }: { relationship: Relationship; alias: string; directed: boolean }) {
        super();
        this.relationship = relationship;
        this.alias = alias;
        this.directed = directed;
    }

    public addField(...fields: AggregationField[]): void {
        this.fields.push(...fields);
    }

    public addNodeField(...fields: AggregationNodeField[]): void {
        this.nodeFields.push(...fields);
    }

    public getSubqueries(node: Node): Clause[] {
        const relatedEntity = this.relationship.target as ConcreteEntity; // TODO: normal entities
        const relatedNode = new Cypher.Node({
            labels: relatedEntity.labels,
        });
        const relationshipType = this.relationship.type;

        const relationshipVar = new Cypher.Relationship({
            type: relationshipType,
        });

        const pattern = new Cypher.Pattern(node)
            .withoutLabels()
            .related(relationshipVar)
            // .withoutVariable()
            .withDirection(directionToCypher(this.relationship.direction, this.directed))
            .to(relatedNode);

        const subClauses = [...this.fields, ...this.nodeFields].flatMap((f) => f.getSubqueries(relatedNode));

        return subClauses.map((clause) => {
            const match = new Cypher.Match(pattern);
            const innerClause = Cypher.concat(match, clause);
            return new Cypher.Call(innerClause).innerWith(node);
        });
    }

    public getProjectionFields(variable: Cypher.Variable): ProjectionField[] {
        const fieldProjections = this.fields.flatMap((f) => f.getProjectionFields(variable));
        const nodeFieldProjections = this.nodeFields.flatMap((f) => f.getProjectionFields(variable));

        const projectionMap = new Cypher.Map();
        const nodeProjectionMap = new Cypher.Map();
        for (const field of fieldProjections) {
            projectionMap.set(field);
        }

        for (const field of nodeFieldProjections) {
            nodeProjectionMap.set(field);
        }

        projectionMap.set("node", nodeProjectionMap);

        return [
            {
                [this.alias]: projectionMap,
            },
        ];
    }
}
