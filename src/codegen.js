import { NodeType } from "./parser.js";

export function generate(ast) {
  const lines = [];

  for (const stmt of ast.body) {
    switch (stmt.type) {
      case NodeType.StructDeclaration:
      case NodeType.TypeAlias:
        // Compile-time only declarations, no runtime code
        break;
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
    case NodeType.StringLiteral: {
      // Escape backslashes and quotes for JS string literal
      const escaped = node.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return { node: `"${escaped}"` };
    }
    case NodeType.NumberLiteral:
      return { node: String(node.value) };
    case NodeType.DotExpression:
      if (node.property === "length") {
        const objResult = generateExpression(node.object);
        if (objResult.variant === "err") return objResult;
        // .length on string literal → compile-time length
        if (
          node.object.type === NodeType.StringLiteral &&
          typeof node.object.value === "string"
        ) {
          return { node: String(node.object.value.length) };
        }
        // Fallback for runtime (shouldn't happen with current tests)
        return { node: `${objResult.node}.length` };
      }
      return {
        variant: "err",
        error: `Unsupported dot property: ${node.property}`,
      };
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
  // Skip compile-time declarations — they don't produce runtime code
  for (let i = body.length - 1; i >= 0; i--) {
    if (
      body[i].type !== NodeType.StructDeclaration &&
      body[i].type !== NodeType.TypeAlias
    )
      return body[i] === stmt;
  }
  return false;
}
