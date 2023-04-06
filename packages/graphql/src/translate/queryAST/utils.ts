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
import type { Attribute } from "../../schema-model/attribute/Attribute";
import type { ConcreteEntity } from "../../schema-model/entity/ConcreteEntity";

export function createNodeFromEntity(entity: ConcreteEntity, name?: string): Cypher.Node {
    if (name) {
        return new Cypher.NamedNode(name, { labels: entity.labels });
    }
    return new Cypher.Node({
        labels: entity.labels,
    });
}

export function getPropertyFromAttribute(variable: Cypher.Variable, attribute: Attribute): Cypher.Property {
    return variable.property(attribute.getDBName());
}

export function getOrThrow<T>(e: T | undefined, message?: string): T {
    if (e === undefined) throw new Error(message || `element not defined`);
    return e;
}

export function directionToCypher(direction: "IN" | "OUT", directed = true): "left" | "right" | "undirected" {
    if (!directed) return "undirected";
    if (direction === "IN") return "left";
    else return "right";
}
