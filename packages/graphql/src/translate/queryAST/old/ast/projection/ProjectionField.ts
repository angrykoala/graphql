import Cypher from "@neo4j/cypher-builder";
import type { Attribute } from "../../../../schema-model/attribute/Attribute";
import { AttributeType } from "../../../../schema-model/attribute/Attribute";
import type { ProjectionField } from "../../QueryASTNode";
import { QueryASTNode } from "../../QueryASTNode";
import { getPropertyFromAttribute } from "../../utils";

export class ProjectionFieldAST extends QueryASTNode {
    private attribute: Attribute;
    private alias: string;

    constructor({ attribute, alias }: { attribute: Attribute; alias: string }) {
        super();
        this.attribute = attribute;
        this.alias = alias;
    }

    public getProjectionFields(variable: Cypher.Variable): ProjectionField[] {
        if (this.attribute.type === AttributeType.Point) {
            const nodeProperty = this.createPointProjection(variable);
            return [{ [this.alias]: nodeProperty }];
        }
        if (this.hasAlias()) {
            const nodeProperty = getPropertyFromAttribute(variable, this.attribute);
            return [{ [this.alias]: nodeProperty }];
        }
        return [`.${this.attribute.name}`];
    }

    private hasAlias(): boolean {
        return this.alias !== this.attribute.name;
    }

    private createPointProjection(variable: Cypher.Variable): Cypher.Expr {
        const pointProperty = variable.property(this.attribute.name);
        // const CypherVariable = getOrCreateCypherVariable(variable);

        // Sadly need to select the whole point object due to the risk of height/z
        // being selected on a 2D point, to which the database will throw an error
        let caseResult: Cypher.Expr;
        if (this.attribute.isArray) {
            const projectionVar = new Cypher.Variable();

            const projectionMap = this.createPointProjectionMap(projectionVar);

            caseResult = new Cypher.ListComprehension(projectionVar)
                .in(variable.property(this.attribute.name))
                .map(projectionMap);
        } else {
            caseResult = this.createPointProjectionMap(pointProperty);
        }

        return new Cypher.Case().when(Cypher.isNotNull(pointProperty)).then(caseResult).else(Cypher.Null);
    }

    private createPointProjectionMap(variable: Cypher.Variable | Cypher.PropertyRef): Cypher.Map {
        const projectionMap = new Cypher.Map();
        projectionMap.set({ point: variable });

        // if (point) {
        //     projectionMap.set({ point: variableOrProperty });
        // }
        // if (crs) {
        //     projectionMap.set({ crs: variableOrProperty.property("crs") });
        // }

        return projectionMap;
    }
}
