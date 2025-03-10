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
import type {
    DirectiveNode,
    DocumentNode,
    FieldDefinitionNode,
    InterfaceTypeDefinitionNode,
    ObjectTypeDefinitionNode,
    UnionTypeDefinitionNode,
} from "graphql";
import { Neo4jGraphQLSchemaValidationError } from "../classes";
import { SCHEMA_CONFIGURATION_OBJECT_DIRECTIVES } from "./library-directives";
import { nodeDirective, privateDirective, relationshipDirective } from "../graphql/directives";
import getFieldTypeMeta from "../schema/get-field-type-meta";
import { filterTruthy } from "../utils/utils";
import type { Operations } from "./Neo4jGraphQLSchemaModel";
import { Neo4jGraphQLSchemaModel } from "./Neo4jGraphQLSchemaModel";
import { Operation } from "./Operation";
import type { Attribute } from "./attribute/Attribute";
import type { CompositeEntity } from "./entity/CompositeEntity";
import { ConcreteEntity } from "./entity/ConcreteEntity";
import { InterfaceEntity } from "./entity/InterfaceEntity";
import { UnionEntity } from "./entity/UnionEntity";
import type { DefinitionCollection } from "./parser/definition-collection";
import { getDefinitionCollection } from "./parser/definition-collection";
import { parseAnnotations } from "./parser/parse-annotation";
import { parseArguments } from "./parser/parse-arguments";
import { parseAttribute, parseAttributeArguments } from "./parser/parse-attribute";
import { findDirective } from "./parser/utils";
import type { NestedOperation, QueryDirection, RelationshipDirection } from "./relationship/Relationship";
import { Relationship } from "./relationship/Relationship";
import { isInArray } from "../utils/is-in-array";

export function generateModel(document: DocumentNode): Neo4jGraphQLSchemaModel {
    const definitionCollection: DefinitionCollection = getDefinitionCollection(document);

    const operations: Operations = definitionCollection.operations.reduce((acc, definition): Operations => {
        acc[definition.name.value] = generateOperation(definition, definitionCollection);
        return acc;
    }, {});

    // hydrate interface to typeNames map
    hydrateInterfacesToTypeNamesMap(definitionCollection);

    const concreteEntities = Array.from(definitionCollection.nodes.values()).map((node) =>
        generateConcreteEntity(node, definitionCollection)
    );

    const concreteEntitiesMap = concreteEntities.reduce((acc, entity) => {
        if (acc.has(entity.name)) {
            throw new Neo4jGraphQLSchemaValidationError(`Duplicate node ${entity.name}`);
        }
        acc.set(entity.name, entity);
        return acc;
    }, new Map<string, ConcreteEntity>());

    const interfaceEntities = Array.from(definitionCollection.interfaceToImplementingTypeNamesMap.entries()).map(
        ([name, concreteEntities]) => {
            const interfaceNode = definitionCollection.interfaceTypes.get(name);
            if (!interfaceNode) {
                throw new Error(`Cannot find interface ${name}`);
            }
            return generateInterfaceEntity(
                name,
                interfaceNode,
                concreteEntities,
                concreteEntitiesMap,
                definitionCollection
            );
        }
    );
    const unionEntities = Array.from(definitionCollection.unionTypes).map(([unionName, unionDefinition]) => {
        return generateUnionEntity(
            unionName,
            unionDefinition,
            unionDefinition.types?.map((t) => t.name.value) || [],
            concreteEntitiesMap
        );
    });

    const annotations = parseAnnotations(definitionCollection.schemaDirectives);

    const schema = new Neo4jGraphQLSchemaModel({
        compositeEntities: [...unionEntities, ...interfaceEntities],
        concreteEntities,
        operations,
        annotations,
    });
    definitionCollection.nodes.forEach((def) => hydrateRelationships(def, schema, definitionCollection));
    definitionCollection.interfaceTypes.forEach((def) => hydrateRelationships(def, schema, definitionCollection));
    addCompositeEntitiesToConcreteEntity(interfaceEntities);
    addCompositeEntitiesToConcreteEntity(unionEntities);
    return schema;
}

function addCompositeEntitiesToConcreteEntity(compositeEntities: CompositeEntity[]): void {
    compositeEntities.forEach((compositeEntity: CompositeEntity) => {
        compositeEntity.concreteEntities.forEach((concreteEntity: ConcreteEntity) =>
            concreteEntity.addCompositeEntities(compositeEntity)
        );
    });
}

function hydrateInterfacesToTypeNamesMap(definitionCollection: DefinitionCollection) {
    return definitionCollection.nodes.forEach((node) => {
        if (!node.interfaces) {
            return;
        }
        const objectTypeName = node.name.value;
        node.interfaces?.forEach((i) => {
            const interfaceTypeName = i.name.value;
            const concreteEntities = definitionCollection.interfaceToImplementingTypeNamesMap.get(interfaceTypeName);
            if (!concreteEntities) {
                throw new Neo4jGraphQLSchemaValidationError(
                    `Could not find composite entity with name ${interfaceTypeName}`
                );
            }
            // TODO: modify the existing array instead of creating a new one
            definitionCollection.interfaceToImplementingTypeNamesMap.set(
                interfaceTypeName,
                concreteEntities.concat(objectTypeName)
            );
        });
    });
}

function generateUnionEntity(
    entityDefinitionName: string,
    unionDefinition: UnionTypeDefinitionNode,
    entityImplementingTypeNames: string[],
    concreteEntities: Map<string, ConcreteEntity>
): UnionEntity {
    const unionEntity = generateCompositeEntity(entityDefinitionName, entityImplementingTypeNames, concreteEntities);
    const annotations = parseAnnotations(unionDefinition.directives || []);
    return new UnionEntity({ ...unionEntity, annotations });
}

function generateInterfaceEntity(
    entityDefinitionName: string,
    definition: InterfaceTypeDefinitionNode,
    entityImplementingTypeNames: string[],
    concreteEntities: Map<string, ConcreteEntity>,
    definitionCollection: DefinitionCollection
): InterfaceEntity {
    const interfaceEntity = generateCompositeEntity(
        entityDefinitionName,
        entityImplementingTypeNames,
        concreteEntities
    );
    const inheritedFields =
        definition.interfaces?.flatMap((interfaceNamedNode) => {
            const interfaceName = interfaceNamedNode.name.value;
            return definitionCollection.interfaceTypes.get(interfaceName)?.fields || [];
        }) || [];

    const fields = (definition.fields || []).map((fieldDefinition) => {
        const inheritedField = inheritedFields?.filter(
            (inheritedField) => inheritedField.name.value === fieldDefinition.name.value
        );
        const isPrivateAttribute = findDirective(fieldDefinition.directives, privateDirective.name);
        const isInheritedPrivateAttribute = inheritedField?.some((inheritedField) =>
            findDirective(inheritedField.directives, privateDirective.name)
        );
        if (isPrivateAttribute || isInheritedPrivateAttribute) {
            return;
        }
        const isRelationshipAttribute = findDirective(fieldDefinition.directives, relationshipDirective.name);
        const isInheritedRelationshipAttribute = inheritedField?.some((inheritedField) =>
            findDirective(inheritedField.directives, relationshipDirective.name)
        );
        if (isRelationshipAttribute || isInheritedRelationshipAttribute) {
            return;
        }
        return parseAttribute(fieldDefinition, inheritedField, definitionCollection, definition.fields);
    });

    const inheritedDirectives =
        definition.interfaces?.flatMap((interfaceNamedNode) => {
            const interfaceName = interfaceNamedNode.name.value;
            return definitionCollection.interfaceTypes.get(interfaceName)?.directives || [];
        }) || [];
    const mergedDirectives = (definition.directives || []).concat(inheritedDirectives);
    const annotations = parseAnnotations(mergedDirectives);

    return new InterfaceEntity({
        ...interfaceEntity,
        description: definition.description?.value,
        attributes: filterTruthy(fields),
        annotations,
    });
}

function generateCompositeEntity(
    entityDefinitionName: string,
    entityImplementingTypeNames: string[],
    concreteEntities: Map<string, ConcreteEntity>
): { name: string; concreteEntities: ConcreteEntity[] } {
    const compositeFields = entityImplementingTypeNames.map((type) => {
        const concreteEntity = concreteEntities.get(type);
        if (!concreteEntity) {
            throw new Neo4jGraphQLSchemaValidationError(`Could not find concrete entity with name ${type}`);
        }
        return concreteEntity;
    });
    /*
   // This is commented out because is currently possible to have leaf interfaces as demonstrated in the test
   // packages/graphql/tests/integration/aggregations/where/node/string.int.test.ts
   if (!compositeFields.length) {
        throw new Neo4jGraphQLSchemaValidationError(
            `Composite entity ${entityDefinitionName} has no concrete entities`
        );
    } */
    return {
        name: entityDefinitionName,
        concreteEntities: compositeFields,
    };
}

function hydrateRelationships(
    definition: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    schema: Neo4jGraphQLSchemaModel,
    definitionCollection: DefinitionCollection
): void {
    const name = definition.name.value;
    const entity = schema.getEntity(name);

    if (!entity) {
        throw new Error(`Cannot find entity ${name}`);
    }
    if (entity instanceof UnionEntity) {
        throw new Error(`Cannot add relationship to union entity ${name}`);
    }
    // TODO: fix ts
    const entityWithRelationships: ConcreteEntity | InterfaceEntity = entity as ConcreteEntity | InterfaceEntity;
    const inheritedFields =
        definition.interfaces?.flatMap((interfaceNamedNode) => {
            const interfaceName = interfaceNamedNode.name.value;
            return definitionCollection.interfaceTypes.get(interfaceName)?.fields || [];
        }) || [];

    // TODO: directives on definition have priority over interfaces
    const mergedFields = (definition.fields || []).concat(inheritedFields);
    const relationshipFieldsMap = new Map<string, Relationship>();
    for (const fieldDefinition of mergedFields) {
        // TODO: takes the first one
        // multiple interfaces can have this annotation - must constrain this flexibility by design
        if (relationshipFieldsMap.has(fieldDefinition.name.value)) {
            continue;
        }
        const mergedDirectives = mergedFields
            .filter((f) => f.name.value === fieldDefinition.name.value)
            .flatMap((f) => f.directives || []);
        const relationshipField = generateRelationshipField(
            fieldDefinition,
            schema,
            entityWithRelationships,
            definitionCollection,
            mergedDirectives,
            getInterfaceNameIfInheritedField(definition, fieldDefinition.name.value, definitionCollection)
        );
        if (relationshipField) {
            relationshipFieldsMap.set(fieldDefinition.name.value, relationshipField);
        }
    }

    for (const relationship of relationshipFieldsMap.values()) {
        entityWithRelationships.addRelationship(relationship);
    }
}

function getInterfaceNameIfInheritedField(
    definition: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    fieldName: string,
    definitionCollection: DefinitionCollection
): string | undefined {
    // TODO: potentially use this instead
    // const fieldNameToSourceNameMap = definition.interfaces?.reduce((acc, interfaceNamedNode) => {
    //     const interfaceName = interfaceNamedNode.name.value;
    //     const fields = definitionCollection.interfaceTypes.get(interfaceName)?.fields || [];
    //     fields.forEach((f) => {
    //         const exists = acc.has(f.name.value);
    //         if (!exists) {
    //             acc.set(f.name.value, interfaceName);
    //         }
    //     });
    //     return acc;
    // }, new Map<string, string>());

    // deliberately using the first interface ONLY
    const fieldNameToSourceNameMap = new Map<string, string>();
    const firstInterfaceName = definition.interfaces?.[0]?.name.value;
    if (firstInterfaceName) {
        const fields = definitionCollection.interfaceTypes.get(firstInterfaceName)?.fields || [];
        fields.forEach((field) => fieldNameToSourceNameMap.set(field.name.value, firstInterfaceName));
    }
    return fieldNameToSourceNameMap?.get(fieldName);
}

function generateRelationshipField(
    field: FieldDefinitionNode,
    schema: Neo4jGraphQLSchemaModel,
    source: ConcreteEntity | InterfaceEntity,
    definitionCollection: DefinitionCollection,
    mergedDirectives: DirectiveNode[],
    inheritedFrom: string | undefined
): Relationship | undefined {
    // TODO: remove reference to getFieldTypeMeta
    const fieldTypeMeta = getFieldTypeMeta(field.type);
    const relationshipUsage = findDirective(field.directives, "relationship");
    if (!relationshipUsage) return undefined;

    const fieldName = field.name.value;
    const relatedEntityName = fieldTypeMeta.name;
    const relatedToEntity = schema.getEntity(relatedEntityName);
    if (!relatedToEntity) throw new Error(`Entity ${relatedEntityName} Not Found`);
    const { type, direction, properties, queryDirection, nestedOperations, aggregate } = parseArguments<{
        type: string;
        direction: RelationshipDirection;
        properties: unknown;
        queryDirection: QueryDirection;
        nestedOperations: NestedOperation[];
        aggregate: boolean;
    }>(relationshipDirective, relationshipUsage);

    let attributes: Attribute[] = [];
    let propertiesTypeName: string | undefined = undefined;
    if (properties && typeof properties === "string") {
        const propertyInterface = definitionCollection.relationshipProperties.get(properties);
        if (!propertyInterface) {
            throw new Error(
                `The \`@relationshipProperties\` directive could not be found on the \`${properties}\` interface`
            );
        }
        propertiesTypeName = properties;

        const inheritedFields =
            propertyInterface.interfaces?.flatMap((interfaceNamedNode) => {
                const interfaceName = interfaceNamedNode.name.value;
                return definitionCollection.interfaceTypes.get(interfaceName)?.fields || [];
            }) || [];
        const fields = (propertyInterface.fields || []).map((fieldDefinition) => {
            const filteredInheritedFields = inheritedFields?.filter(
                (inheritedField) => inheritedField.name.value === fieldDefinition.name.value
            );
            const isPrivateAttribute = findDirective(fieldDefinition.directives, privateDirective.name);
            const isInheritedPrivateAttribute = filteredInheritedFields?.some((inheritedField) =>
                findDirective(inheritedField.directives, privateDirective.name)
            );
            if (isPrivateAttribute || isInheritedPrivateAttribute) {
                return;
            }
            return parseAttribute(
                fieldDefinition,
                filteredInheritedFields,
                definitionCollection,
                propertyInterface.fields
            );
        });

        attributes = filterTruthy(fields);
    }

    const annotations = parseAnnotations(mergedDirectives);
    const args = parseAttributeArguments(field.arguments || [], definitionCollection);

    return new Relationship({
        name: fieldName,
        type,
        args,
        attributes,
        source,
        target: relatedToEntity,
        direction,
        isList: Boolean(fieldTypeMeta.array),
        queryDirection,
        nestedOperations,
        aggregate,
        isNullable: !fieldTypeMeta.required,
        description: field.description?.value,
        annotations: annotations,
        propertiesTypeName,
        inheritedFrom,
    });
}

function generateConcreteEntity(
    definition: ObjectTypeDefinitionNode,
    definitionCollection: DefinitionCollection
): ConcreteEntity {
    const inheritsFrom = definition.interfaces?.map((interfaceNamedNode) => {
        const interfaceName = interfaceNamedNode.name.value;
        return definitionCollection.interfaceTypes.get(interfaceName);
    });

    const fields = (definition.fields || []).map((fieldDefinition) => {
        const inheritedFields = inheritsFrom?.flatMap((i) => i?.fields || []);
        const inheritedField = inheritedFields?.filter(
            (inheritedField) => inheritedField.name.value === fieldDefinition.name.value
        );

        // If the attribute is the private directive then
        const isPrivateAttribute = findDirective(fieldDefinition.directives, privateDirective.name);
        const isInheritedPrivateAttribute = inheritedField?.some((inheritedField) =>
            findDirective(inheritedField.directives, privateDirective.name)
        );
        if (isPrivateAttribute || isInheritedPrivateAttribute) {
            return;
        }

        const isRelationshipAttribute = findDirective(fieldDefinition.directives, relationshipDirective.name);
        const isInheritedRelationshipAttribute = inheritedField?.some((inheritedField) =>
            findDirective(inheritedField.directives, relationshipDirective.name)
        );
        if (isRelationshipAttribute || isInheritedRelationshipAttribute) {
            return;
        }
        return parseAttribute(fieldDefinition, inheritedField, definitionCollection, definition.fields);
    });

    // schema configuration directives are propagated onto concrete entities
    const schemaDirectives = definitionCollection.schemaExtension?.directives?.filter((x) =>
        isInArray(SCHEMA_CONFIGURATION_OBJECT_DIRECTIVES, x.name.value)
    );
    const annotations = parseAnnotations((definition.directives || []).concat(schemaDirectives || []));

    return new ConcreteEntity({
        name: definition.name.value,
        description: definition.description?.value,
        labels: getLabels(definition),
        attributes: filterTruthy(fields),
        annotations,
    });
}

function getLabels(entityDefinition: ObjectTypeDefinitionNode): string[] {
    const nodeDirectiveUsage = findDirective(entityDefinition.directives, nodeDirective.name);
    if (nodeDirectiveUsage) {
        const nodeArguments = parseArguments<{ labels?: string[] }>(nodeDirective, nodeDirectiveUsage);
        if (nodeArguments.labels?.length) {
            return nodeArguments.labels;
        }
    }
    return [entityDefinition.name.value];
}

function generateOperation(
    definition: ObjectTypeDefinitionNode,
    definitionCollection: DefinitionCollection
): Operation {
    const attributes = (definition.fields || [])
        .map((fieldDefinition) => parseAttribute(fieldDefinition, undefined, definitionCollection))
        .filter((attribute) => attribute.annotations.cypher);

    return new Operation({
        name: definition.name.value,
        attributes,
        annotations: parseAnnotations(definition.directives || []),
    });
}
