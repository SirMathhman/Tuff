import type { AstNode } from "./ast";

/** Validate type constraints on the AST. */
export function typeCheck(statements: AstNode[]): void {
  for (const stmt of statements) {
    checkNode(stmt);
  }
}

function checkNode(node: AstNode): void {
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
      }
      checkNode(node.operand);
      break;

    case "binop":
      checkNode(node.left);
      checkNode(node.right);
      break;

    case "let":
      checkNode(node.value);
      break;

    case "block":
      for (const stmt of node.statements) {
        checkNode(stmt);
      }
      break;

    case "if-statement":
    case "if-expression":
      checkNode(node.condition);
      checkNode(node.thenBranch);
      checkNode(node.elseBranch);
      break;

    case "while-loop":
      checkNode(node.condition);
      checkNode(node.body);
      break;

    case "for-loop":
      checkNode(node.range);
      checkNode(node.body);
      break;

    case "range":
      checkNode(node.start);
      checkNode(node.end);
      break;

    case "array-literal":
      for (const el of node.elements) {
        checkNode(el);
      }
      break;

    case "array-index":
      checkNode(node.array);
      checkNode(node.index);
      break;

    case "struct-literal":
      for (const f of node.fields) {
        checkNode(f.value);
      }
      break;

    case "struct-access":
      checkNode(node.struct);
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
