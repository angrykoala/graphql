import type { RelationshipField } from "./RelationshipField";
import type { AttributeField } from "./AttributeField";
import type { ConnectionField } from "./connection/ConnectionField";

export type SelectionSetField = RelationshipField | AttributeField | ConnectionField;
