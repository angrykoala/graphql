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
import type { Attribute } from "../../../../schema-model/attribute/Attribute";
import { AttributeType } from "../../../../schema-model/attribute/Attribute";
import type { ProjectionField } from "../../types";
import { getPropertyFromAttribute } from "../../utils";
import { QueryASTNode } from "../QueryASTNode";

export class AttributeField extends QueryASTNode {
    protected attribute: Attribute;
    protected alias: string;

    constructor({ attribute, alias }: { attribute: Attribute; alias: string }) {
        super();
        this.attribute = attribute;
        this.alias = alias;
    }

    public getProjectionFields(variable: Cypher.Variable): ProjectionField[] {
        if (this.attribute.type === AttributeType.DateTime) {
            const nodeProperty = this.createDateTimeProjection(variable);
            return [{ [this.alias]: nodeProperty }];
        }

        if (this.hasAlias()) {
            const nodeProperty = getPropertyFromAttribute(variable, this.attribute);
            return [{ [this.alias]: nodeProperty }];
        }
        return [this.attribute.name];
    }

    private hasAlias(): boolean {
        return this.alias !== this.attribute.name;
    }

    private createDateTimeProjection(variable: Cypher.Variable): Cypher.Expr {
        const fieldProperty = variable.property(this.attribute.name);

        if (this.attribute.isArray) {
            const comprehensionVariable = new Cypher.Variable();
            const apocFormat = this.createApocConvertFormat(comprehensionVariable);

            return new Cypher.ListComprehension(comprehensionVariable).in(fieldProperty).map(apocFormat);
        }
        return this.createApocConvertFormat(fieldProperty);
    }

    private createApocConvertFormat(variableOrProperty: Cypher.Variable | Cypher.Property): Cypher.Expr {
        return Cypher.apoc.date.convertFormat(variableOrProperty, "iso_zoned_date_time", "iso_offset_date_time");
    }
}
