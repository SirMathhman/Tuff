import type { ASTNode } from "./ast";

export function generateJS(node: ASTNode): string {
  switch (node.kind) {
    case "number":
      return String(node.value);

    case "identifier":
      return node.name;

    case "member_access":
      return `${generateJS(node.object)}[${JSON.stringify(node.property)}]`;

    case "binary_op":
      return `${generateJS(node.left)} ${node.op} ${generateJS(node.right)}`;

    case "assign":
      return `${node.name} = ${generateJS(node.value)}`;

    default:
      throw new Error(`Unexpected node kind in codegen`);
  }
}
