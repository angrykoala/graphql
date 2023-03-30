import type { ResolveTree } from "graphql-parse-resolve-info";
import { ConcreteEntity } from "../../../schema-model/entity/ConcreteEntity";
import type { Entity } from "../../../schema-model/entity/Entity";
import type { Neo4jGraphQLSchemaModel } from "../../../schema-model/Neo4jGraphQLSchemaModel";
import type { GraphQLWhereArg } from "../../../types";
import { QueryAST } from "../ast/QueryAST";
import { FilterASTFactory } from "./FilterASTFactory";
import { SelectionSetASTFactory } from "./SelectionSetASTFactory";

export class QueryASTFactory {
    private schemaModel: Neo4jGraphQLSchemaModel;
    private filterFactory: FilterASTFactory;
    private selectionSetFactory: SelectionSetASTFactory;

    constructor(schemaModel: Neo4jGraphQLSchemaModel) {
        this.schemaModel = schemaModel;
        this.filterFactory = new FilterASTFactory();
        this.selectionSetFactory = new SelectionSetASTFactory(this.filterFactory);
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
        return ast;
    }
}
