import type { ConnectionFilter } from "./connection/ConnectionFilter";
import type { LogicalFilter } from "./LogicalFilter";
import type { PropertyFilter } from "./PropertyFilter";
import type { RelationshipFilter } from "./RelationshipFilter";

export type Filter = PropertyFilter | LogicalFilter | RelationshipFilter | ConnectionFilter;
