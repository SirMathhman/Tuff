import type { ASTNode } from "./ast";
import type { Result } from "./result";
import { ok, err, map, andThen } from "./result";

export function generateJS(node: ASTNode): Result<string, Error> {
  switch (node.kind) {
    case "number":
      return ok(String(node.value));

    case "boolean":
      return ok(String(node.value));

    case "identifier":
      return ok(node.name);

    case "member_access":
      return map(generateJS(node.object), (object) => {
        return `${object}[${JSON.stringify(node.property)}]`;
      });

    case "binary_op":
      return andThen(generateJS(node.left), (left) => {
        return map(generateJS(node.right), (right) => {
          return `${left} ${node.op} ${right}`;
        });
      });

    case "assign":
      return map(generateJS(node.value), (value) => {
        return `${node.name} = ${value}`;
      });

    case "if":
      return andThen(generateJS(node.condition), (condition) => {
        return andThen(generateJS(node.thenBranch), (thenBranch) => {
          return map(generateJS(node.elseBranch), (elseBranch) => {
            return `(${condition} ? ${thenBranch} : ${elseBranch})`;
          });
        });
      });

    default:
      return err(new Error(`Unexpected node kind in codegen`));
  }
}
