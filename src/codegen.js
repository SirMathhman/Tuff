import { NodeType } from "./parser.js";

export function generate(ast) {
  const lines = [];

  for (const stmt of ast.body) {
    switch (stmt.type) {
      case NodeType.LetStatement: {
        const result = generateExpression(stmt.value);
        if (result.variant === "err") return result;
        lines.push(`var ${stmt.name} = ${result.node};`);
        break;
      }
      case NodeType.ExpressionStatement: {
        // Last expression becomes return, others are just statements
        const exprResult = generateExpression(stmt.expression);
        if (exprResult.variant === "err") return exprResult;
        if (isLastStatement(ast, stmt)) {
          lines.push(`return ${exprResult.node};`);
        } else {
          lines.push(`${exprResult.node};`);
        }
        break;
      }
    }
  }

  // If no statements, return 0
  if (lines.length === 0) {
    return { node: "return 0;" };
  }

  const body =
    `const tokens = stdIn.split(/\\s+/).map(t => parseInt(t, 10));\n` +
    lines.join("\n");
  return { node: body };
}

function generateExpression(node) {
  switch (node.type) {
    case NodeType.NumberLiteral:
      return { node: String(node.value) };
    case NodeType.Identifier:
      return { node: node.name };
    case NodeType.CallExpression:
      if (node.name === "read") {
        return { node: "tokens.shift()" };
      }
      return { variant: "err", error: `Unknown function: ${node.name}` };
    case NodeType.BinaryExpression: {
      const left = generateExpression(node.left);
      if (left.variant === "err") return left;
      const right = generateExpression(node.right);
      if (right.variant === "err") return right;
      return { node: `${left.node} ${node.operator} ${right.node}` };
    }
    default:
      return {
        variant: "err",
        error: `Unsupported expression type: ${node.type}`,
      };
  }
}

function isLastStatement(ast, stmt) {
  const body = ast.body;
  // Filter out empty-like nodes and find the last real statement
  return body[body.length - 1] === stmt;
}
