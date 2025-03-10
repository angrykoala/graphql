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

import type { ConcreteEntityAdapter } from "../../../schema-model/entity/model-adapters/ConcreteEntityAdapter";
import type { InterfaceEntityAdapter } from "../../../schema-model/entity/model-adapters/InterfaceEntityAdapter";
import type { UnionEntityAdapter } from "../../../schema-model/entity/model-adapters/UnionEntityAdapter";
import { isObject } from "../../../utils/utils";
import { isUnionEntity } from "./is-union-entity";

/**
 *  Given a Record<string, any> representing a where argument for a composite target fields returns its concrete where argument.
    For instance, given:
    {
        Genre: { name: "Sci-Fi" },
        Movie: { title: "The Matrix" }
    } 
    Returns { name: "Horror" } for the Genre concreteTarget.
    It also handles shared filters for interfaces, for instance:
    { title: "The Matrix", _on: { Movie: { director: "Wachowski" } } } 
    will be transformed into:
    { title: "The Matrix", director: "Wachowski" }
**/
export function getConcreteWhere(
    compositeTarget: UnionEntityAdapter | InterfaceEntityAdapter,
    concreteTarget: ConcreteEntityAdapter,
    whereArgs?: Record<string, any>
): Record<string, any> {
    if (!whereArgs) {
        return {};
    }
    if (isUnionEntity(compositeTarget)) {
        return whereArgs[concreteTarget.name] ?? {};
    } else {
        // interface may have shared filters, inject them as if they were present under _on
        const sharedInterfaceFilters = Object.entries(whereArgs).filter(
            ([key]) => key !== "_on" && key !== "typename_IN"
        );
        const _on: Record<string, any> | undefined = isObject(whereArgs["_on"]) ? whereArgs["_on"] : undefined;

        // if concrete target is present in _on then merge its filters with the shared ones, if _on it's not defined then returns the shared filters
        // this is due to the fact that the shared filters are applied only if the concrete target is present in _on or _on is not defined
        if (_on && _on[concreteTarget.name]) {
            // apply shared filters to concrete target filters
            return Object.fromEntries([...sharedInterfaceFilters, ...Object.entries(_on[concreteTarget.name])]);
        } else {
            return Object.fromEntries(sharedInterfaceFilters);
        }
    }
}
