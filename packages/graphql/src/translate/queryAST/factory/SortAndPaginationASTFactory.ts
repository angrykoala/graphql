import type { ConcreteEntity } from "../../../schema-model/entity/ConcreteEntity";
import type { GraphQLOptionsArg } from "../../../types";
import { Pagination } from "../ast/pagination/Pagination";
import { PropertySort } from "../ast/sort/PropertySort";
import type { Sort } from "../ast/sort/Sort";

export class SortAndPaginationASTFactory {
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

    public createPagination(options: GraphQLOptionsArg): Pagination | undefined {
        if (options.limit || options.offset) {
            return new Pagination({
                skip: options.offset,
                limit: options.limit,
            });
        }
    }
}
