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
    case NodeType.Program:
      for (const child of node.body) {
        const result = validateIdentifiers(child, knownIds);
        if (!result.ok) return result;
      }
      return { ok: true };
    case NodeType.LetStatement:
      knownIds.add(node.name);
      return validateIdentifiers(node.value, knownIds);
    case NodeType.ExpressionStatement:
      return validateIdentifiers(node.expression, knownIds);
    case NodeType.Identifier:
      if (!knownIds.has(node.name)) {
        return { ok: false, error: `Unknown identifier: ${node.name}` };
      }
      return { ok: true };
    case NodeType.CallExpression:
      // Builtins
      if (node.name !== "read") {
        return { ok: false, error: `Unknown function: ${node.name}` };
      }
      for (const arg of node.arguments) {
        const result = validateIdentifiers(arg, knownIds);
        if (!result.ok) return result;
      }
      return { ok: true };
    case NodeType.BinaryExpression: {
      const leftResult = validateIdentifiers(node.left, knownIds);
      if (!leftResult.ok) return leftResult;
      return validateIdentifiers(node.right, knownIds);
    }
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
