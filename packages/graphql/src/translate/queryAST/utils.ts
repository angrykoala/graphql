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
    return variable.property(attribute.name);
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
