// ---- Code Generator ----

import type { ASTNode } from "./compiler";

interface GenCtx {
  indent: number;
}

function indentStr(ctx: GenCtx): string {
  return "  ".repeat(ctx.indent);
}

function emitProgram(
  ctx: GenCtx,
  node: { kind: "Program"; body: ASTNode[] },
): string {
  return node.body
    .map((stmt) => {
      if (stmt.kind === "Fn") return emitFn(ctx, stmt);
      return indentStr(ctx) + emitStmt(ctx, stmt) + ";";
    })
    .join("\n");
}

function emitStmt(ctx: GenCtx, node: ASTNode): string {
  if (node.kind === "Block") return emitBlock(ctx, node);
  if (node.kind === "If") return emitIf(ctx, node);
  if (node.kind === "While") return emitWhile(ctx, node);
  if (node.kind === "Let") return emitLet(ctx, node);
  return emitExpr(ctx, node);
}

function emitLet(
  ctx: GenCtx,
  node: { kind: "Let"; name: string; value: ASTNode },
): string {
  return "let " + node.name + " = " + emitExpr(ctx, node.value);
}

function emitFn(
  ctx: GenCtx,
  node: { kind: "Fn"; name: string; params: string[]; body: ASTNode },
): string {
  const params = node.params.join(", ");
  if (node.body.kind === "Block") {
    return (
      indentStr(ctx) +
      "function " +
      node.name +
      "(" +
      params +
      ") {\n" +
      emitBlock(ctx, node.body) +
      "\n" +
      indentStr(ctx) +
      "}"
    );
  }
  return (
    indentStr(ctx) +
    "function " +
    node.name +
    "(" +
    params +
    ") { return " +
    emitExpr(ctx, node.body) +
    "; }"
  );
}

function emitIf(
  ctx: GenCtx,
  node: {
    kind: "If";
    cond: ASTNode;
    thenBody: ASTNode[];
    elseBody: ASTNode[];
  },
): string {
  const thenCode = emitBody(ctx, node.thenBody, 2);
  const elseCode = emitElse(ctx, node.elseBody);
  return (
    indentStr(ctx) +
    "if (" +
    emitExpr(ctx, node.cond) +
    ") {\n" +
    thenCode +
    "\n" +
    indentStr(ctx) +
    "}" +
    elseCode
  );
}

function emitBody(ctx: GenCtx, body: ASTNode[], extraIndent: number): string {
  return body
    .map((stmt) => {
      if (stmt.kind === "Fn") return emitFn(ctx, stmt);
      return (
        indentStr(ctx) + "  ".repeat(extraIndent) + emitStmt(ctx, stmt) + ";"
      );
    })
    .join("\n");
}

function emitElse(ctx: GenCtx, body: ASTNode[]): string {
  if (body.length === 0) return "";
  return (
    "\n" +
    indentStr(ctx) +
    "else {\n" +
    emitBody(ctx, body, 2) +
    "\n" +
    indentStr(ctx) +
    "}"
  );
}

function emitWhile(
  ctx: GenCtx,
  node: { kind: "While"; cond: ASTNode; body: ASTNode[] },
): string {
  const bodyCode = emitBody(ctx, node.body, 2);
  return (
    indentStr(ctx) +
    "while (" +
    emitExpr(ctx, node.cond) +
    ") {\n" +
    bodyCode +
    "\n" +
    indentStr(ctx) +
    "}"
  );
}

function emitBlock(
  ctx: GenCtx,
  node: { kind: "Block"; body: ASTNode[] },
): string {
  const childCtx = { indent: ctx.indent + 1 };
  const lines = node.body.map((stmt) => {
    if (stmt.kind === "Fn") return emitFn(childCtx, stmt);
    return indentStr(childCtx) + emitStmt(childCtx, stmt) + ";";
  });
  return lines.join("\n");
}

function emitExpr(ctx: GenCtx, node: ASTNode): string {
  if (node.kind === "Binary") return emitBinary(ctx, node);
  if (node.kind === "Unary") return emitUnary(ctx, node);
  if (node.kind === "Call") return emitCall(ctx, node);
  if (node.kind === "Index") return emitIndex(ctx, node);
  if (node.kind === "Property") return emitProperty(ctx, node);
  if (node.kind === "ArrayLit") return emitArrayLit(ctx, node);
  if (node.kind === "ObjectLit") return emitObjectLit(ctx, node);
  return emitLiteral(node);
}

function emitLiteral(node: ASTNode): string {
  switch (node.kind) {
    case "Ident":
      return node.name;
    case "Number":
      return String(node.value);
    case "String":
      return '"' + node.value + '"';
    case "Bool":
      return node.value ? "true" : "false";
    default:
      throw new Error("Cannot emit '" + node.kind + "' as an expression");
  }
}

function emitBinary(
  ctx: GenCtx,
  node: { kind: "Binary"; op: string; left: ASTNode; right: ASTNode },
): string {
  return emitExpr(ctx, node.left) + " " + node.op + " " + emitExpr(ctx, node.right);
}

function emitUnary(
  ctx: GenCtx,
  node: { kind: "Unary"; op: string; operand: ASTNode },
): string {
  return node.op + emitExpr(ctx, node.operand);
}

function emitCall(
  ctx: GenCtx,
  node: { kind: "Call"; callee: ASTNode; args: ASTNode[] },
): string {
  const args = node.args.map((arg) => emitExpr(ctx, arg)).join(", ");
  return emitExpr(ctx, node.callee) + "(" + args + ")";
}

function emitIndex(
  ctx: GenCtx,
  node: { kind: "Index"; obj: ASTNode; index: ASTNode },
): string {
  return emitExpr(ctx, node.obj) + "[" + emitExpr(ctx, node.index) + "]";
}

function emitProperty(
  ctx: GenCtx,
  node: { kind: "Property"; obj: ASTNode; prop: string },
): string {
  return emitExpr(ctx, node.obj) + "." + node.prop;
}

function emitArrayLit(
  ctx: GenCtx,
  node: { kind: "ArrayLit"; elements: ASTNode[] },
): string {
  const elements = node.elements.map((el) => emitExpr(ctx, el)).join(", ");
  return "[" + elements + "]";
}

function emitObjectLit(
  ctx: GenCtx,
  node: { kind: "ObjectLit"; properties: { key: string; value: ASTNode }[] },
): string {
  const props = node.properties
    .map((p) => p.key + ": " + emitExpr(ctx, p.value))
    .join(", ");
  return "{ " + props + " }";
}

export function generate(ast: ASTNode): string {
  const ctx: GenCtx = { indent: 0 };
  if (ast.kind === "Program") return emitProgram(ctx, ast);
  return emitStmt(ctx, ast);
}
