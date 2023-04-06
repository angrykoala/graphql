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

import { CypherAnnotation } from "./CypherAnnotation";
import { AuthorizationAnnotation } from "./AuthorizationAnnotation";
import { AliasAnnotation } from "./AliasAnnotation";

export type Annotation = CypherAnnotation | AuthorizationAnnotation | AliasAnnotation;

export enum AnnotationsKey {
    cypher = "cypher",
    authorization = "authorization",
    alias = "alias",
}

export type Annotations = {
    [AnnotationsKey.cypher]: CypherAnnotation;
    [AnnotationsKey.authorization]: AuthorizationAnnotation;
    [AnnotationsKey.alias]: AliasAnnotation;
};

export function annotationToKey(ann: Annotation): keyof Annotations {
    if (ann instanceof CypherAnnotation) return AnnotationsKey.cypher;
    if (ann instanceof AuthorizationAnnotation) return AnnotationsKey.authorization;
    if (ann instanceof AliasAnnotation) return AnnotationsKey.alias;
    throw new Error("annotation not known");
}
