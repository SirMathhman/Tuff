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
  if (!node.type) return;

  switch (node.type) {
    case NodeType.Program:
      for (const child of node.body) validateIdentifiers(child, knownIds);
      break;
    case NodeType.LetStatement:
      knownIds.add(node.name);
      validateIdentifiers(node.value, knownIds);
      break;
    case NodeType.ExpressionStatement:
      validateIdentifiers(node.expression, knownIds);
      break;
    case NodeType.Identifier:
      if (!knownIds.has(node.name)) {
        throw new Error(`Unknown identifier: ${node.name}`);
      }
      break;
    case NodeType.CallExpression:
      // Builtins
      if (node.name !== "read") {
        throw new Error(`Unknown function: ${node.name}`);
      }
      for (const arg of node.arguments) validateIdentifiers(arg, knownIds);
      break;
    case NodeType.BinaryExpression:
      validateIdentifiers(node.left, knownIds);
      validateIdentifiers(node.right, knownIds);
      break;
  }
}

export function compileTuffToJS(source) {
  try {
    const tokens = tokenize(source);
    const ast = parse(tokens);

    // Validate identifiers against builtins and declared variables
    const knownIdentifiers = new Set(["read"]);
    validateIdentifiers(ast, knownIdentifiers);

    const js = generate(ast);
    return Ok(js);
  } catch (e) {
    return Err(e.message || String(e));
  }
}
