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

import { Neo4jGraphQLSchemaValidationError } from "../../classes";
import type { Annotations } from "../annotation/Annotation";
import type { Attribute } from "../attribute/Attribute";
import type { Relationship } from "../relationship/Relationship";
import type { CompositeEntity } from "./CompositeEntity";
import type { ConcreteEntity } from "./ConcreteEntity";

export class InterfaceEntity implements CompositeEntity {
    public readonly name: string;
    public readonly description?: string;
    // TODO: this is really (ConcreteEntity|InterfaceEntity)...
    public readonly concreteEntities: ConcreteEntity[];
    public readonly attributes: Map<string, Attribute> = new Map();
    public readonly relationships: Map<string, Relationship> = new Map();
    public readonly annotations: Partial<Annotations>;

    constructor({
        name,
        description,
        concreteEntities,
        attributes = [],
        annotations = {},
        relationships = [],
    }: {
        name: string;
        description?: string;
        concreteEntities: ConcreteEntity[];
        attributes?: Attribute[];
        annotations?: Partial<Annotations>;
        relationships?: Relationship[];
    }) {
        this.name = name;
        this.description = description;
        this.concreteEntities = concreteEntities;
        this.annotations = annotations;
        for (const attribute of attributes) {
            this.addAttribute(attribute);
        }

        for (const relationship of relationships) {
            this.addRelationship(relationship);
        }
    }

    isConcreteEntity(): this is ConcreteEntity {
        return false;
    }
    isCompositeEntity(): this is CompositeEntity {
        return true;
    }

    private addAttribute(attribute: Attribute): void {
        if (this.attributes.has(attribute.name)) {
            throw new Neo4jGraphQLSchemaValidationError(`Attribute ${attribute.name} already exists in ${this.name}`);
        }
        this.attributes.set(attribute.name, attribute);
    }

    public addRelationship(relationship: Relationship): void {
        if (this.relationships.has(relationship.name)) {
            throw new Neo4jGraphQLSchemaValidationError(
                `Attribute ${relationship.name} already exists in ${this.name}`
            );
        }
        this.relationships.set(relationship.name, relationship);
    }

    public findAttribute(name: string): Attribute | undefined {
        return this.attributes.get(name);
    }

    public findRelationship(name: string): Relationship | undefined {
        return this.relationships.get(name);
    }
}
