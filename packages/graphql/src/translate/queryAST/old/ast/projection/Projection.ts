import type Cypher from "@neo4j/cypher-builder";
import type { ProjectionField } from "../../QueryASTNode";
import { QueryASTNode } from "../../QueryASTNode";
import type { ConnectionProjectionFieldAST } from "./ConnectionProjection";
import type { ProjectionFieldAST } from "./ProjectionField";
import type { RelationshipProjectionFieldAST } from "./RelationshipProjectionField";

export class ProjectionAST extends QueryASTNode {
    private columns: Array<ProjectionFieldAST | RelationshipProjectionFieldAST | ConnectionProjectionFieldAST>;

    constructor(columns: Array<ProjectionFieldAST | RelationshipProjectionFieldAST | ConnectionProjectionFieldAST>) {
        super();
        this.columns = columns;
    }

    public getProjectionFields(node: Cypher.Node): ProjectionField[] {
        const projectionFields: ProjectionField[] = [];
        for (const column of this.columns) {
            const fields = column.getProjectionFields(node);
            projectionFields.push(...fields);
        }
        return projectionFields;
    }

    public getSubqueries(parentNode: Cypher.Node): Cypher.Clause[] {
        return this.columns.flatMap((c) => c.getSubqueries(parentNode));
    }
}
