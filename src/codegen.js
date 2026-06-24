import { NodeType } from "./parser.js";

export function generate(ast) {
  const lines = [];
  let hasReturn = false;

  for (const stmt of ast.body) {
    switch (stmt.type) {
      case NodeType.StructDeclaration:
      case NodeType.TypeAlias:
        // Compile-time only declarations, no runtime code
        break;
      case NodeType.FunctionDeclaration: {
        const bodyResult = generateExpression(stmt.body);
        if (bodyResult.variant === "err") return bodyResult;
        lines.push(`function ${stmt.name}() { return ${bodyResult.node}; }`);
        break;
      }
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
        if (isLastRuntimeStatement(ast, stmt)) {
          lines.push(`return ${exprResult.node};`);
          hasReturn = true;
        } else {
          lines.push(`${exprResult.node};`);
        }
        break;
      }
    }
  }

  // If no statements or no return was emitted, default to returning 0
  if (lines.length === 0 || !hasReturn) {
    lines.push("return 0;");
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
    case NodeType.ObjectLiteral:
      // Empty struct instantiation → empty JS object (no runtime semantics yet)
      return { node: "{}" };
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
    case NodeType.CallExpression: {
      // Special builtin
      if (node.name === "read") {
        return { node: "tokens.shift()" };
      }
      // Generate call for any identifier — validation ensures it's known
      const args = [];
      for (const arg of node.arguments) {
        const result = generateExpression(arg);
        if (result.variant === "err") return result;
        args.push(result.node);
      }
      return { node: `${node.name}(${args.join(", ")})` };
    }
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

function isLastRuntimeStatement(ast, stmt) {
  const body = ast.body;
  // Only ExpressionStatements can produce a runtime return value.
  // Declarations (struct/type/fn/let) never count as the last statement for returning.
  for (let i = body.length - 1; i >= 0; i--) {
    if (body[i].type === NodeType.ExpressionStatement)
      return body[i] === stmt;
  }
  return false;
}
