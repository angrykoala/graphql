import Cypher from "@neo4j/cypher-builder";
import type { Integer } from "neo4j-driver";
import { QueryASTNode } from "../QueryASTNode";

export type PaginationField = {
    skip: Cypher.Param<number | Integer> | undefined;
    limit: Cypher.Param<number | Integer> | undefined;
};

export class Pagination extends QueryASTNode {
    private skip: Integer | number | undefined;
    private limit: Integer | number | undefined;

    constructor({ skip, limit }: { skip?: number | Integer; limit?: number | Integer }) {
        super();
        this.skip = skip;
        this.limit = limit;
    }

    public getPagination(): PaginationField | undefined {
        return {
            skip: this.skip ? new Cypher.Param(this.skip) : undefined,
            limit: this.limit ? new Cypher.Param(this.limit) : undefined,
        };
    }
}
