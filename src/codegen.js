import { NodeType } from "./parser.js";

export function generate(ast) {
  const lines = [];

  for (const stmt of ast.body) {
    switch (stmt.type) {
      case NodeType.LetStatement:
        lines.push(`var ${stmt.name} = ${generateExpression(stmt.value)};`);
        break;
      case NodeType.ExpressionStatement: {
        // Last expression becomes return, others are just statements
        const exprJS = generateExpression(stmt.expression);
        if (isLastStatement(ast, stmt)) {
          lines.push(`return ${exprJS};`);
        } else {
          lines.push(`${exprJS};`);
        }
        break;
      }
    }
  }

  // If no statements, return 0
  if (lines.length === 0) {
    return "return 0;";
  }

  const body =
    `const tokens = stdIn.split(/\\s+/).map(t => parseInt(t, 10));\n` +
    lines.join("\n");
  return body;
}

function generateExpression(node) {
  switch (node.type) {
    case NodeType.NumberLiteral:
      return String(node.value);
    case NodeType.Identifier:
      return node.name;
    case NodeType.CallExpression:
      if (node.name === "read") {
        return "tokens.shift()";
      }
      throw new Error(`Unknown function: ${node.name}`);
    case NodeType.BinaryExpression:
      return `${generateExpression(node.left)} ${node.operator} ${generateExpression(node.right)}`;
    default:
      throw new Error(`Unsupported expression type: ${node.type}`);
  }
}

function isLastStatement(ast, stmt) {
  const body = ast.body;
  // Filter out empty-like nodes and find the last real statement
  return body[body.length - 1] === stmt;
}
