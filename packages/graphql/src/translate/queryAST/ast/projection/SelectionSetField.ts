import type { RelationshipField } from "./RelationshipField";
import type { AttributeField } from "./AttributeField";
import type { ConnectionField } from "./connection/ConnectionField";
import type { AggregationSelectionSet } from "./aggregations/AggregationSelectionSet";

export type SelectionSetField = RelationshipField | AttributeField | ConnectionField | AggregationSelectionSet;
