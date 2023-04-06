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

import Cypher, { nodes } from "@neo4j/cypher-builder";
import type { Node, Clause } from "@neo4j/cypher-builder/src";
import type { ConcreteEntity } from "../../../../../schema-model/entity/ConcreteEntity";
import type { Relationship } from "../../../../../schema-model/relationship/Relationship";
import { QueryASTNode } from "../../QueryASTNode";
import type { ProjectionField } from "../../QueryASTNode";
import type { CountField } from "./fields/CountField";
import type { EdgeAggregationSelectionSet } from "./EdgeAggregationSelectionSet";
import type { NodeAggregationSelectionSet } from "./NodeAggregationSelectionSet";
import { directionToCypher } from "../../../utils";

type AggregationTopLevelFields = CountField;

export class AggregationSelectionSet extends QueryASTNode {
    private relationship: Relationship;
    private alias: string;
    private directed: boolean;

    private nodeFields: NodeAggregationSelectionSet | undefined;
    private edgeFields: EdgeAggregationSelectionSet | undefined;
    private topLevelFields: Array<CountField> = [];

    constructor({ relationship, alias, directed }: { relationship: Relationship; alias: string; directed: boolean }) {
        super();
        this.relationship = relationship;
        this.alias = alias;
        this.directed = directed;
        // this.nodeSelectionSet = new NodeAggregationSelectionSet(relationship, directed);
    }

    public addField(...fields: AggregationTopLevelFields[]): void {
        this.topLevelFields.push(...fields);
    }

    public addNodeSelectionSet(node: NodeAggregationSelectionSet): void {
        this.nodeFields = node;
    }

    public addEdgeSelectionSet(edge: EdgeAggregationSelectionSet): void {
        this.edgeFields = edge;
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

        const nodeSubClauses = this.nodeFields?.getSubqueries(relatedNode) || [];
        const edgeSubClauses = this.edgeFields?.getSubqueries(relationshipVar) || [];
        const subClauses = this.topLevelFields.flatMap((f) => f.getSubqueries(relatedNode));

        // This logic should go on nested nodes, it is here simply for tck compatibility
        return [...subClauses, ...nodeSubClauses, ...edgeSubClauses].map((clause) => {
            const match = new Cypher.Match(pattern);
            const innerClause = Cypher.concat(match, clause);
            return new Cypher.Call(innerClause).innerWith(node);
        });
    }

    public getProjectionFields(variable: Cypher.Variable): ProjectionField[] {
        const nodeProjection = this.nodeFields?.getProjectionFields(variable) || [];
        const edgeProjection = this.edgeFields?.getProjectionFields(variable) || [];
        const fieldProjections = this.topLevelFields.flatMap((f) => f.getProjectionFields(variable));

        const projectionMap = new Cypher.Map();
        for (const field of [...fieldProjections, ...nodeProjection, ...edgeProjection]) {
            projectionMap.set(field);
        }

        return [
            {
                [this.alias]: projectionMap,
            },
        ];
    }
}
