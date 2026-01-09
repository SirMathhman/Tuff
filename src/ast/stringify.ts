import type { ASTExpression, ASTStatement } from "./nodes";

interface HasKind {
  kind: string;
}

function getKindFromValue(value: HasKind): string {
  return value.kind;
}

function throwUnknownASTKind(type: string, value: HasKind): never {
  throw new Error(
    `Cannot convert AST ${type} to string: ${getKindFromValue(value)}`
  );
}

function formatLiteralExpr(expr: ASTExpression): string | undefined {
  switch (expr.kind) {
    case "identifier":
      return expr.name;
    case "int":
      return String(expr.value) + (expr.suffix ?? "");
    case "float":
      return String(expr.value);
    case "string":
      return `"${expr.value}"`;
    case "bool":
      return expr.value ? "true" : "false";
    default:
      return undefined;
  }
}

function formatAccessExpr(expr: ASTExpression): string | undefined {
  switch (expr.kind) {
    case "member":
      return `${astExprToString(expr.object)}.${expr.property}`;
    case "index":
      return `${astExprToString(expr.object)}[${astExprToString(expr.index)}]`;
    case "paren":
      return `(${astExprToString(expr.expr)})`;
    default:
      return undefined;
  }
}

/**
 * Convert AST expression back to string (for gradual migration)
 */
export function astExprToString(expr: ASTExpression): string {
  const literal = formatLiteralExpr(expr);
  if (literal !== undefined) return literal;

  const access = formatAccessExpr(expr);
  if (access !== undefined) return access;

  switch (expr.kind) {
    case "binary":
      return formatBinaryExpr(expr);
    case "unary":
      return `${expr.operator}${astExprToString(expr.operand)}`;
    case "call":
      return formatCallExpr(expr);
    case "array":
      return formatArrayExpr(expr);
    case "struct-instantiation":
      return formatStructInstExpr(expr);
    case "block-expr":
      return formatBlockExpr(expr);
    case "match":
      return formatMatchExpr(expr);
    default:
      return throwUnknownASTKind("expression", expr);
  }
}

function formatBinaryExpr(expr: ASTExpression & { kind: "binary" }): string {
  return `(${astExprToString(expr.left)} ${expr.operator} ${astExprToString(
    expr.right
  )})`;
}

function formatCallExpr(expr: ASTExpression & { kind: "call" }): string {
  const args = expr.args.map(astExprToString).join(", ");
  return `${astExprToString(expr.callee)}(${args})`;
}

function formatArrayExpr(expr: ASTExpression & { kind: "array" }): string {
  const elems = expr.elements.map(astExprToString).join(", ");
  return `[${elems}]`;
}

function formatStructInstExpr(
  expr: ASTExpression & { kind: "struct-instantiation" }
): string {
  const fields = expr.fields
    .map((f) => `${f.name}: ${astExprToString(f.value)}`)
    .join(", ");
  return `${expr.structName} { ${fields} }`;
}

function formatBlockExpr(expr: ASTExpression & { kind: "block-expr" }): string {
  const stmts = expr.statements.map(astStmtToString).join("; ");
  const final = expr.finalExpr ? astExprToString(expr.finalExpr) : "";
  return `{ ${stmts}${final ? "; " + final : ""} }`;
}

function formatMatchExpr(expr: ASTExpression & { kind: "match" }): string {
  const cases = expr.cases
    .map((c) => `${c.pattern} => ${astExprToString(c.body)}`)
    .join(", ");
  return `match (${astExprToString(expr.expr)}) { ${cases} }`;
}

/**
 * Convert AST statement back to string (for gradual migration)
 */
export function astStmtToString(stmt: ASTStatement): string {
  switch (stmt.kind) {
    case "let":
      return formatLetStmt(stmt);
    case "if":
      return formatIfStmt(stmt);
    case "while":
      return formatWhileStmt(stmt);
    case "for":
      return formatForStmt(stmt);
    case "expression":
      return astExprToString(stmt.expr);
    case "block":
      return `{ ${stmt.statements.map(astStmtToString).join("; ")} }`;
    case "fn":
      return formatFnDecl(stmt);
    case "struct":
      return formatStructDecl(stmt);
    case "type":
      return `type ${stmt.name} = ${stmt.aliasedType}`;
    case "yield":
      return `yield ${astExprToString(stmt.expr)}`;
    case "assignment":
      return formatAssignment(stmt);
    case "import":
      return formatImport(stmt);
    case "extern":
      return formatExtern(stmt);
    default:
      return throwUnknownASTKind("statement", stmt);
  }
}

function formatLetStmt(stmt: ASTStatement & { kind: "let" }): string {
  let s = "let ";
  if (stmt.isMutable) s += "mut ";
  s += stmt.name;
  if (stmt.annotation) s += `: ${stmt.annotation}`;
  if (stmt.rhs) s += ` = ${astExprToString(stmt.rhs)}`;
  return s;
}

function formatIfStmt(stmt: ASTStatement & { kind: "if" }): string {
  let s = `if (${astExprToString(stmt.condition)}) { ${stmt.trueBranch
    .map(astStmtToString)
    .join("; ")} }`;
  if (stmt.falseBranch) {
    s += ` else { ${stmt.falseBranch.map(astStmtToString).join("; ")} }`;
  }
  return s;
}

function formatWhileStmt(stmt: ASTStatement & { kind: "while" }): string {
  return `while (${astExprToString(stmt.condition)}) { ${stmt.body
    .map(astStmtToString)
    .join("; ")} }`;
}

function formatForStmt(stmt: ASTStatement & { kind: "for" }): string {
  const mut = stmt.isMutable ? "mut " : "";
  const start = astExprToString(stmt.startExpr);
  const end = astExprToString(stmt.endExpr);
  const body = stmt.body.map(astStmtToString).join("; ");
  return `for (let ${mut}${stmt.loopVar} in ${start}..${end}) { ${body} }`;
}

function formatFnDecl(stmt: ASTStatement & { kind: "fn" }): string {
  const params = stmt.params
    .map((p) => (p.annotation ? `${p.name}: ${p.annotation}` : p.name))
    .join(", ");
  const ret = stmt.resultAnnotation ? `: ${stmt.resultAnnotation}` : "";
  const body = Array.isArray(stmt.body)
    ? `{ ${stmt.body.map(astStmtToString).join("; ")} }`
    : `=> ${astExprToString(stmt.body)}`;
  return `fn ${stmt.name}(${params})${ret} ${body}`;
}

function formatStructDecl(stmt: ASTStatement & { kind: "struct" }): string {
  const fields = stmt.fields
    .map((f) => `${f.name}: ${f.annotation}`)
    .join(", ");
  return `struct ${stmt.name} { ${fields} }`;
}

function formatAssignment(stmt: ASTStatement & { kind: "assignment" }): string {
  let target = "";
  if (stmt.target.type === "identifier") {
    target = stmt.target.name!;
  } else if (stmt.target.type === "deref") {
    target = `*${astExprToString(stmt.target.object!)}`;
  } else if (stmt.target.type === "field") {
    target = `${astExprToString(stmt.target.object!)}.${stmt.target.field}`;
  } else if (stmt.target.type === "index") {
    const obj = astExprToString(stmt.target.object!);
    const idx = astExprToString(stmt.target.index!);
    target = `${obj}[${idx}]`;
  }
  const op = stmt.operator ? `${stmt.operator}=` : "=";
  return `${target} ${op} ${astExprToString(stmt.value)}`;
}

function formatImport(stmt: ASTStatement & { kind: "import" }): string {
  const items = stmt.items
    .map((i) => (i.alias ? `${i.name} as ${i.alias}` : i.name))
    .join(", ");
  return `from "${stmt.from}" use ${items}`;
}

function formatExtern(stmt: ASTStatement & { kind: "extern" }): string {
  const ann = stmt.annotation ? `: ${stmt.annotation}` : "";
  return `extern ${stmt.subKind} ${stmt.name}${ann}`;
}
