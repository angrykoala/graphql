import type { ResolveTree } from "graphql-parse-resolve-info";
import { ConcreteEntity } from "../../../schema-model/entity/ConcreteEntity";
import type { Entity } from "../../../schema-model/entity/Entity";
import type { Neo4jGraphQLSchemaModel } from "../../../schema-model/Neo4jGraphQLSchemaModel";
import type { GraphQLOptionsArg, GraphQLWhereArg } from "../../../types";
import { QueryAST } from "../ast/QueryAST";
import { FilterASTFactory } from "./FilterASTFactory";
import { SelectionSetASTFactory } from "./SelectionSetASTFactory";
import { SortAndPaginationASTFactory } from "./SortAndPaginationASTFactory";

export class QueryASTFactory {
    private schemaModel: Neo4jGraphQLSchemaModel;
    private filterFactory: FilterASTFactory;
    private selectionSetFactory: SelectionSetASTFactory;
    private sortAndPaginationFactory: SortAndPaginationASTFactory;

    constructor(schemaModel: Neo4jGraphQLSchemaModel) {
        this.schemaModel = schemaModel;
        this.filterFactory = new FilterASTFactory();
        this.sortAndPaginationFactory = new SortAndPaginationASTFactory();
        this.selectionSetFactory = new SelectionSetASTFactory(this.filterFactory, this.sortAndPaginationFactory);
    }

    public createQueryAST(resolveTree: ResolveTree, entity: Entity): QueryAST {
        if (!(entity instanceof ConcreteEntity)) throw new Error("TBD");
        const ast = new QueryAST(entity);

        const where = resolveTree.args.where as GraphQLWhereArg | undefined;
        if (where) {
            const filters = this.filterFactory.createFilters(where, entity);
            ast.addFilters(...filters);
        }
        const projectionFields = { ...resolveTree.fieldsByTypeName[entity.name] };
        const selectionSetFields = this.selectionSetFactory.createSelectionSetAST(projectionFields, entity);
        ast.addSelectionSetFields(...selectionSetFields);

        const options = resolveTree.args.options as GraphQLOptionsArg | undefined;

        if (options) {
            const sort = this.sortAndPaginationFactory.createSortFields(options, entity);
            ast.addSort(...sort);

            const pagination = this.sortAndPaginationFactory.createPagination(options);
            if (pagination) {
                ast.addPagination(pagination);
            }
        }

        return ast;
    }
}
