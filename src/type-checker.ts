import type { AstNode } from "./ast";

/** Validate type constraints on the AST. */
export function typeCheck(statements: AstNode[]): void {
  const types: Record<string, "u8"> = {};
  for (const stmt of statements) {
    checkNode(stmt, types);
  }
}

function checkNode(node: AstNode, types: Record<string, "u8">): void {
  switch (node.type) {
    case "num":
      if (node.numType === "u8" && (node.value < 0 || node.value > 255))
        throw new Error(`U8 value out of range: ${node.value}`);
      break;

    case "unop":
      if (node.op === "-") {
        const operand = node.operand;
        if (operand.type === "num" && operand.numType === "u8")
          throw new Error("Cannot negate unsigned integer");
        if (operand.type === "id" && types[operand.name] === "u8")
          throw new Error("Cannot negate unsigned integer");
      }
      checkNode(node.operand, types);
      break;

    case "binop":
      checkNode(node.left, types);
      checkNode(node.right, types);
      break;

    case "let":
      if (node.value.type === "num" && node.value.numType === "u8")
        types[node.name] = "u8";
      checkNode(node.value, types);
      break;

    case "block":
      for (const stmt of node.statements) {
        checkNode(stmt, types);
      }
      break;

    case "if-statement":
    case "if-expression":
      checkNode(node.condition, types);
      checkNode(node.thenBranch, types);
      checkNode(node.elseBranch, types);
      break;

    case "while-loop":
      checkNode(node.condition, types);
      checkNode(node.body, types);
      break;

    case "for-loop":
      checkNode(node.range, types);
      checkNode(node.body, types);
      break;

    case "range":
      checkNode(node.start, types);
      checkNode(node.end, types);
      break;

    case "array-literal":
      for (const el of node.elements) {
        checkNode(el, types);
      }
      break;

    case "array-index":
      checkNode(node.array, types);
      checkNode(node.index, types);
      break;

    case "struct-literal":
      for (const f of node.fields) {
        checkNode(f.value, types);
      }
      break;

    case "struct-access":
      checkNode(node.struct, types);
      break;

    case "ref":
    case "deref":
    case "assign":
    case "derefassign":
    case "compoundassign":
    case "break":
    case "continue":
    case "bool":
    case "id":
      break;
  }
}
