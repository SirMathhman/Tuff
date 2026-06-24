function Ok(value) {
  return { variant: "ok", value };
}

function Err(error) {
  return { variant: "err", error };
}

import { tokenize } from "./tokenizer.js";
import { parse, NodeType } from "./parser.js";
import { generate } from "./codegen.js";

// Validate that all identifiers in the AST are known builtins or declared variables
function validateIdentifiers(node, knownIds) {
  if (!node.type) return { ok: true };

  switch (node.type) {
    case NodeType.StructDeclaration:
    case NodeType.TypeAlias:
      // Compile-time declarations don't reference unknown identifiers at runtime
      return { ok: true };
    case NodeType.FunctionDeclaration: {
      knownIds.add(node.name);
      const fnScope = new Set(knownIds);
      if (node.params) {
        for (const param of node.params) {
          // 'this' as a receiver is always valid, don't add it to knownIds
          // since codegen handles it specially
          if (param !== "this") {
            fnScope.add(param);
          }
        }
      }
      return validateIdentifiers(node.body, fnScope);
    }
    case NodeType.Program:
      for (const child of node.body) {
        const result = validateIdentifiers(child, knownIds);
        if (!result.ok) return result;
      }
      return { ok: true };
    case NodeType.LetStatement:
      knownIds.add(node.name);
      // Track mutable variables for assignment validation
      if (node.mutable) {
        knownIds.add(`__mutable_${node.name}`);
      }
      return validateIdentifiers(node.value, knownIds);
    case NodeType.AssignmentStatement: {
      // Direct this.x assignment — target must be a known mutable variable
      if (node.target) {
        const mutableKey = `__mutable_${node.target}`;
        if (!knownIds.has(mutableKey)) {
          return {
            ok: false,
            error: `Cannot assign to '${node.target}' (not declared as mutable)`,
          };
        }
      }
      // General expression-based assignment — validate target and value
      if (node.targetExpr) {
        const targetResult = validateIdentifiers(node.targetExpr, knownIds);
        if (!targetResult.ok) return targetResult;
      }
      return validateIdentifiers(node.value, knownIds);
    }
    case NodeType.ExpressionStatement:
      return validateIdentifiers(node.expression, knownIds);
    case NodeType.Identifier:
      if (!knownIds.has(node.name)) {
        return { ok: false, error: `Unknown identifier: ${node.name}` };
      }
      return { ok: true };
    case NodeType.CallExpression:
      // Builtins or user-declared functions
      if (!knownIds.has(node.name)) {
        return { ok: false, error: `Unknown function: ${node.name}` };
      }
      for (const arg of node.arguments) {
        const result = validateIdentifiers(arg, knownIds);
        if (!result.ok) return result;
      }
      return { ok: true };
    case NodeType.MethodCallExpression:
      // Validate the method name is a known function
      if (!knownIds.has(node.methodName)) {
        return { ok: false, error: `Unknown method: ${node.methodName}` };
      }
      for (const arg of node.arguments) {
        const result = validateIdentifiers(arg, knownIds);
        if (!result.ok) return result;
      }
      // Also validate the object expression
      return validateIdentifiers(node.object, knownIds);
    case NodeType.BinaryExpression: {
      const leftResult = validateIdentifiers(node.left, knownIds);
      if (!leftResult.ok) return leftResult;
      return validateIdentifiers(node.right, knownIds);
    }
    case NodeType.ThisExpression:
      // "this" is always valid — resolves to _ctx at runtime
      return { ok: true };
  }

  return { ok: true };
}

export function compileTuffToJS(source) {
  const tokensResult = tokenize(source);
  if (tokensResult.variant === "err") return Err(tokensResult.error);

  const astResult = parse(tokensResult.value);
  if (astResult.variant === "err") return Err(astResult.error);

  // Validate identifiers against builtins and declared variables
  const knownIdentifiers = new Set(["read"]);
  const validateResult = validateIdentifiers(astResult.node, knownIdentifiers);
  if (!validateResult.ok) return Err(validateResult.error);

  const jsResult = generate(astResult.node);
  if (jsResult.variant === "err") return Err(jsResult.error);

  return Ok(jsResult.node);
}
