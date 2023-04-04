import type { ConcreteEntity } from "../../../schema-model/entity/ConcreteEntity";
import type { GraphQLOptionsArg } from "../../../types";
import { PropertySort } from "../ast/sort/PropertySort";
import type { Sort } from "../ast/sort/Sort";

export class SortASTFactory {
    public createSortFields(options: GraphQLOptionsArg, entity: ConcreteEntity): Sort[] {
        return (options.sort || [])
            ?.flatMap((s) => Object.entries(s))
            .map(([fieldName, sortDir]) => {
                const attribute = entity.findAttribute(fieldName);
                if (!attribute) throw new Error(`no filter attribute ${fieldName}`);

                return new PropertySort({
                    direction: sortDir,
                    attribute,
                });
            });
    }
}
