import { NodeType } from "./parser.js";

export function generate(ast, options = {}) {
  const opts = Object.assign(
    { includePreamble: true, isEntryPoint: true },
    options,
  );
  const { includePreamble, isEntryPoint } = opts;
  const lines = [];
  let hasReturn = false;

  for (const stmt of ast.body) {
    switch (stmt.type) {
      case NodeType.StructDeclaration:
      case NodeType.TypeAlias:
        // Compile-time only declarations, no runtime code
        break;
      case NodeType.FunctionDeclaration: {
        // Check if first param is a receiver (named 'this')
        const hasReceiver = stmt.params && stmt.params[0] === "this";
        // Rename 'this' to '_self' in generated JS since 'this' can't be a variable name
        const jsParams = (
          hasReceiver
            ? ["_self", ...(stmt.params || []).slice(1)]
            : stmt.params || []
        ).join(", ");
        // Build locals set with renamed receiver for codegen lookup
        const localsSet = new Set(jsParams.split(", ").filter(Boolean));
        const bodyResult = generateFunctionBody(
          stmt.body,
          localsSet,
          hasReceiver,
        );
        if (bodyResult.variant === "err") return bodyResult;
        lines.push(`function ${stmt.name}(${jsParams}) { ${bodyResult.node} }`);
        // Register function on _ctx so call expressions can look it up consistently
        lines.push(`_ctx.${stmt.name} = ${stmt.name};`);
        break;
      }
      case NodeType.ExternImportStatement: {
        // extern let { x , y } = extern lib; → _ctx.x = _ctx.lib.x;
        for (const binding of stmt.bindings) {
          lines.push(`_ctx.${binding} = _ctx.${stmt.moduleName}.${binding};`);
        }
        break;
      }
      case NodeType.ExportStatement: {
        if (stmt.isFunctionExport) {
          // out fn NAME(params) => body ; — generate function declaration + register on _ctx
          const fnBodyNode = stmt.value.body;
          const jsParams = stmt.value.params.map((p) => String(p)).join(", ");
          // Pass params as locals so they resolve to bare names, not _ctx lookups
          const paramLocals = new Set(stmt.value.params);
          const linesForFn = [];
          if (fnBodyNode.type === NodeType.BlockStatement) {
            for (const child of fnBodyNode.body) {
              if (child.type === NodeType.ReturnStatement) {
                const retResult = generateExpression(
                  child.expression,
                  paramLocals,
                  false,
                );
                if (retResult.variant === "err") return retResult;
                linesForFn.push(`return ${retResult.node};`);
              } else {
                const exprRes = generateExpression(child, paramLocals, false);
                if (exprRes.variant === "err") return exprRes;
                linesForFn.push(exprRes.node);
              }
            }
          } else {
            // ExpressionStatement
            const bodyResult = generateExpression(
              fnBodyNode.expression,
              paramLocals,
              false,
            );
            if (bodyResult.variant === "err") return bodyResult;
            linesForFn.push(`return ${bodyResult.node};`);
          }
          lines.push(
            `function ${stmt.name}(${jsParams}) { ${linesForFn.join(" ")} }`,
          );
          // Register function on _ctx so it can be called
          lines.push(`_ctx.${stmt.name} = ${stmt.name};`);
          // Also register in __exports for cross-module wiring (if __exists exists)
          lines.push(
            `if (_ctx.__exports) { _ctx.__exports.${stmt.name} = ${stmt.name}; }`,
          );
        } else {
          const exportResult = generateExpression(stmt.value);
          if (exportResult.variant === "err") return exportResult;
          // Exports go into _ctx.__exports, then compileModulesToJS wires them to module namespace
          lines.push(`_ctx.__exports.${stmt.name} = ${exportResult.node};`);
        }
        break;
      }
      case NodeType.LetStatement: {
        const letResult = generateExpression(stmt.value);
        if (letResult.variant === "err") return letResult;

        // Destructuring: let { x , y } = expr ;
        if (stmt.bindings) {
          for (const binding of stmt.bindings) {
            lines.push(`_ctx.${binding} = ${letResult.node}.${binding};`);
          }
        } else {
          lines.push(`_ctx.${stmt.name} = ${letResult.node};`);
        }

        break;
      }
      case NodeType.AssignmentStatement: {
        const assignResult = generateExpression(stmt.value);
        if (assignResult.variant === "err") return assignResult;
        // Direct this.x assignment
        if (stmt.target) {
          lines.push(`_ctx.${stmt.target} = ${assignResult.node};`);
        }
        // General expression-based assignment (e.g. temp.x = 200)
        else if (stmt.targetExpr) {
          const targetCode = generateExpression(stmt.targetExpr).node;
          lines.push(`${targetCode} = ${assignResult.node};`);
        }
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

  // Only add a default return for the entry point module — dependency modules should not exit early
  if (isEntryPoint && (lines.length === 0 || !hasReturn)) {
    lines.push("return 0;");
  }

  const code = lines.join("\n");
  if (includePreamble) {
    const body =
      `var _ctx = {};
const tokens = stdIn.split(/\\s+/).map(t => parseInt(t, 10));\n` + code;
    return { node: body };
  }
  return { node: code };
}

// Generate function body — handles both BlockStatement and single expression statement
function generateFunctionBody(bodyNode, locals, hasReceiver) {
  if (bodyNode.type === NodeType.BlockStatement) {
    const blockLines = [];
    for (const stmt of bodyNode.body) {
      switch (stmt.type) {
        case NodeType.ReturnStatement: {
          const exprResult = generateExpression(
            stmt.expression,
            locals,
            hasReceiver,
          );
          if (exprResult.variant === "err") return exprResult;
          blockLines.push(`return ${exprResult.node};`);
          break;
        }
        default:
          // Ignore non-return statements inside function blocks for now
          break;
      }
    }
    return { node: blockLines.join("\n") };
  }

  // Single expression body (fat arrow style)
  const result = generateExpression(bodyNode.expression, locals, hasReceiver);
  if (result.variant === "err") return result;
  return { node: `return ${result.node};` };
}

function generateExpression(node, locals, hasReceiver) {
  switch (node.type) {
    case NodeType.StringLiteral: {
      // Escape backslashes and quotes for JS string literal
      const escaped = node.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return { node: `"${escaped}"` };
    }
    case NodeType.NumberLiteral:
      return { node: String(node.value) };
    case NodeType.ObjectLiteral: {
      if (!node.fields || node.fields.length === 0) {
        return { node: "{}" };
      }
      // Struct instantiation with fields
      const fieldEntries = [];
      for (const f of node.fields) {
        const valResult = generateExpression(f.value, locals, hasReceiver);
        if (valResult.variant === "err") return valResult;
        fieldEntries.push(`${f.key}: ${valResult.node}`);
      }
      return { node: `{${fieldEntries.join(", ")}}` };
    }
    case NodeType.QualifiedPathExpression: {
      // parent::child -> _ctx.parent.child
      // Recursively build the full path, adding _ctx. only at the root identifier level
      let baseCode;
      if (node.object.type === NodeType.Identifier) {
        baseCode = `_ctx.${node.object.name}`;
      } else if (node.object.type === NodeType.QualifiedPathExpression) {
        // Recurse into nested FQN — it already has _ctx. prefix
        const objResult = generateExpression(node.object, locals, hasReceiver);
        if (objResult.variant === "err") return objResult;
        baseCode = objResult.node;
      } else {
        const objResult = generateExpression(node.object, locals, hasReceiver);
        if (objResult.variant === "err") return objResult;
        baseCode = objResult.node;
      }
      return { node: `${baseCode}.${node.property}` };
    }
    case NodeType.DotExpression: {
      if (node.property === "length") {
        const objResult = generateExpression(node.object, locals, hasReceiver);
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
      // General dot property access
      const objResult = generateExpression(node.object, locals, hasReceiver);
      if (objResult.variant === "err") return objResult;
      return { node: `${objResult.node}.${node.property}` };
    }
    case NodeType.MethodCallExpression: {
      // Method call: obj.method() → _ctx.methodName(obj, ...args)
      const objResult = generateExpression(node.object, locals, hasReceiver);
      if (objResult.variant === "err") return objResult;
      const args = [objResult.node];
      for (const arg of node.arguments) {
        const result = generateExpression(arg, locals, hasReceiver);
        if (result.variant === "err") return result;
        args.push(result.node);
      }
      // Look up on _ctx so extern methods from native modules work correctly
      return { node: `_ctx.${node.methodName}(${args.join(", ")})` };
    }
    case NodeType.ThisExpression:
      // Inside a method with receiver, 'this' refers to the renamed '_self' param
      if (hasReceiver) {
        return { node: "_self" };
      }
      // Otherwise return a shallow snapshot of global context
      return { node: "{..._ctx}" };
    case NodeType.Identifier:
      if (locals && locals.has(node.name)) {
        return { node: node.name };
      }
      return { node: `_ctx.${node.name}` };
    case NodeType.CallExpression: {
      const args = [];
      for (const arg of node.arguments) {
        const result = generateExpression(arg, locals, hasReceiver);
        if (result.variant === "err") return result;
        args.push(result.node);
      }
      // Special builtin
      if (node.name === "read") {
        return { node: `tokens.shift()` };
      }
      // Call on FQN path or dot expression: callee(args)
      if (node.callee) {
        const calleeResult = generateExpression(
          node.callee,
          locals,
          hasReceiver,
        );
        if (calleeResult.variant === "err") return calleeResult;
        return { node: `${calleeResult.node}(${args.join(", ")})` };
      }
      // Generate call for any identifier — validation ensures it's known
      return { node: `_ctx.${node.name}(${args.join(", ")})` };
    }
    case NodeType.BinaryExpression: {
      const left = generateExpression(node.left, locals, hasReceiver);
      if (left.variant === "err") return left;
      const right = generateExpression(node.right, locals, hasReceiver);
      if (right.variant === "err") return right;
      return { node: `${left.node} ${node.operator} ${right.node}` };
    }
    case NodeType.IfExpression: {
      const cond = generateExpression(node.condition, locals, hasReceiver);
      if (cond.variant === "err") return cond;
      const thenExpr = generateExpression(node.thenBranch, locals, hasReceiver);
      if (thenExpr.variant === "err") return thenExpr;
      const elseExpr = generateExpression(node.elseBranch, locals, hasReceiver);
      if (elseExpr.variant === "err") return elseExpr;
      return { node: `(${cond.node} ? ${thenExpr.node} : ${elseExpr.node})` };
    }
    case NodeType.BooleanLiteral:
      return { node: String(node.value) };
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
  // Declarations and assignments (struct/type/fn/let/assignment) never count as the last statement for returning.
  for (let i = body.length - 1; i >= 0; i--) {
    if (body[i].type === NodeType.ExpressionStatement) return body[i] === stmt;
  }
  return false;
}
