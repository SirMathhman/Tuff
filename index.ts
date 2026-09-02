export type CompileError = {
  kind: "parse" | "type" | "emit";
  location: { line: number; column: number };
  message: string;
  fix?: string;
};

export type CompileResult =
  | { ok: true; value: string }
  | { ok: false; error: CompileError };

export function compileTuffToTypeScript(tuffSource: string): CompileResult {
  const expr = extractExpression(tuffSource);
  if (expr === "") {
    return { ok: true, value: "process.exit(0);" };
  }

  const { statements, finalExpr } = splitStatements(expr);

  const unbalanced = findUnbalancedParen(finalExpr);
  if (unbalanced) {
    return {
      ok: false,
      error: {
        kind: "parse",
        location: unbalanced,
        message: "Unbalanced parentheses",
      },
    };
  }

  const parsedStatements = statements.map(parseStatement);
  const parsedFinal = parseStatement(finalExpr);

  const typeError = checkMutability(parsedStatements, parsedFinal);
  if (typeError) {
    return { ok: false, error: typeError };
  }

  const refMap = buildRefMap(parsedStatements);
  const lines = parsedStatements.map((s) => `${emitStatement(s, refMap)};`);
  lines.push(`process.exit(${emitStatement(parsedFinal, refMap)});`);
  return { ok: true, value: lines.join("\n") };
}

type Expr =
  | { kind: "ident"; name: string }
  | { kind: "lit"; value: string }
  | { kind: "addressOf"; target: Expr }
  | { kind: "deref"; target: Expr }
  | { kind: "binary"; op: string; left: Expr; right: Expr }
  | { kind: "member"; object: Expr; property: string }
  | { kind: "call"; callee: Expr; args: Expr[] };

type Statement =
  | { kind: "let"; name: string; init: Expr }
  | { kind: "letMut"; name: string; init: Expr }
  | { kind: "assign"; name: string; value: Expr }
  | { kind: "derefAssign"; target: Expr; value: Expr }
  | { kind: "expr"; value: Expr };

interface Parser {
  src: string;
  pos: number;
}

function parseExpr(s: string): Expr {
  const p: Parser = { src: s.trim(), pos: 0 };
  const expr = parseBinary(p);
  skipWs(p);
  if (p.pos < p.src.length) {
    throw new Error(`Unexpected trailing input at position ${p.pos}`);
  }
  return expr;
}

function parseBinary(p: Parser): Expr {
  let left = parseUnary(p);
  for (;;) {
    const op = tryBinaryOp(p);
    if (!op) break;
    const right = parseUnary(p);
    left = { kind: "binary", op, left, right };
  }
  return left;
}

function tryBinaryOp(p: Parser): string | null {
  skipWs(p);
  const rest = p.src.slice(p.pos);
  if (rest.startsWith("==")) {
    p.pos += 2;
    return "==";
  }
  if (rest.startsWith("!=")) {
    p.pos += 2;
    return "!=";
  }
  if (rest.startsWith("<=")) {
    p.pos += 2;
    return "<=";
  }
  if (rest.startsWith(">=")) {
    p.pos += 2;
    return ">=";
  }
  if (rest.startsWith("+")) {
    p.pos += 1;
    return "+";
  }
  if (rest.startsWith("-")) {
    p.pos += 1;
    return "-";
  }
  if (rest.startsWith("*")) {
    p.pos += 1;
    return "*";
  }
  if (rest.startsWith("/")) {
    p.pos += 1;
    return "/";
  }
  if (rest.startsWith("<")) {
    p.pos += 1;
    return "<";
  }
  if (rest.startsWith(">")) {
    p.pos += 1;
    return ">";
  }
  return null;
}

function parseUnary(p: Parser): Expr {
  skipWs(p);
  if (p.src.startsWith("&mut ", p.pos)) {
    p.pos += 5;
    return { kind: "addressOf", target: parseUnary(p) };
  }
  if (p.src[p.pos] === "&") {
    p.pos += 1;
    return { kind: "addressOf", target: parseUnary(p) };
  }
  if (p.src[p.pos] === "*") {
    p.pos += 1;
    return { kind: "deref", target: parseUnary(p) };
  }
  return parsePostfix(p);
}

function parsePostfix(p: Parser): Expr {
  let expr = parsePrimary(p);
  for (;;) {
    skipWs(p);
    if (p.src[p.pos] === ".") {
      p.pos += 1;
      const property = parseIdent(p);
      expr = { kind: "member", object: expr, property };
    } else if (p.src[p.pos] === "(") {
      p.pos += 1;
      const args: Expr[] = [];
      skipWs(p);
      if (p.src[p.pos] !== ")") {
        args.push(parseBinary(p));
        while (p.src[p.pos] === ",") {
          p.pos += 1;
          skipWs(p);
          args.push(parseBinary(p));
        }
      }
      skipWs(p);
      if (p.src[p.pos] !== ")") throw new Error("Expected ')'");
      p.pos += 1;
      expr = { kind: "call", callee: expr, args };
    } else {
      break;
    }
  }
  return expr;
}

function parsePrimary(p: Parser): Expr {
  skipWs(p);
  const ch = p.src[p.pos]!;
  if (ch === "(") {
    p.pos += 1;
    const expr = parseBinary(p);
    skipWs(p);
    if (p.src[p.pos] !== ")") throw new Error("Expected ')'");
    p.pos += 1;
    return expr;
  }
  if (ch === '"') {
    const end = p.src.indexOf('"', p.pos + 1);
    if (end === -1) throw new Error("Unterminated string literal");
    const value = p.src.slice(p.pos, end + 1);
    p.pos = end + 1;
    return { kind: "lit", value };
  }
  if (/[0-9]/.test(ch)) {
    let end = p.pos;
    while (end < p.src.length && /[0-9]/.test(p.src[end]!)) end++;
    const value = p.src.slice(p.pos, end);
    p.pos = end;
    return { kind: "lit", value };
  }
  if (/[a-zA-Z_]/.test(ch)) {
    const name = parseIdent(p);
    return { kind: "ident", name };
  }
  throw new Error(`Unexpected character '${ch}' at position ${p.pos}`);
}

function parseIdent(p: Parser): string {
  let end = p.pos;
  while (end < p.src.length && /[\w]/.test(p.src[end]!)) end++;
  const name = p.src.slice(p.pos, end);
  p.pos = end;
  return name;
}

function skipWs(p: Parser) {
  while (p.pos < p.src.length && /\s/.test(p.src[p.pos]!)) p.pos++;
}

function emitExpr(e: Expr): string {
  switch (e.kind) {
    case "ident":
      return e.name;
    case "lit":
      return e.value;
    case "addressOf":
      return emitExpr(e.target);
    case "deref":
      return emitExpr(e.target);
    case "binary":
      return `${emitExpr(e.left)} ${e.op} ${emitExpr(e.right)}`;
    case "member":
      return `${emitExpr(e.object)}.${e.property}`;
    case "call":
      return `${emitExpr(e.callee)}(${e.args.map(emitExpr).join(", ")})`;
  }
}

function parseStatement(s: string): Statement {
  const trimmed = s.trim();
  const letMutMatch = trimmed.match(/^let\s+mut\s+(\w+)\s*=\s*(.*)$/);
  if (letMutMatch) {
    return {
      kind: "letMut",
      name: letMutMatch[1]!,
      init: parseExpr(letMutMatch[2]!),
    };
  }
  const letMatch = trimmed.match(/^let\s+(\w+)\s*=\s*(.*)$/);
  if (letMatch) {
    return { kind: "let", name: letMatch[1]!, init: parseExpr(letMatch[2]!) };
  }
  const derefAssignMatch = trimmed.match(/^\*(\w+)\s*=\s*(.*)$/);
  if (derefAssignMatch) {
    return {
      kind: "derefAssign",
      target: { kind: "ident", name: derefAssignMatch[1]! },
      value: parseExpr(derefAssignMatch[2]!),
    };
  }
  const assignMatch = trimmed.match(/^(\w+)\s*=\s*(.*)$/);
  if (assignMatch) {
    return {
      kind: "assign",
      name: assignMatch[1]!,
      value: parseExpr(assignMatch[2]!),
    };
  }
  return { kind: "expr", value: parseExpr(trimmed) };
}

function buildRefMap(statements: Statement[]): Map<string, string> {
  const refMap = new Map<string, string>();
  for (const stmt of statements) {
    if (
      (stmt.kind === "let" || stmt.kind === "letMut") &&
      stmt.init.kind === "addressOf"
    ) {
      const target = stmt.init.target;
      if (target.kind === "ident") {
        refMap.set(stmt.name, target.name);
      }
    }
  }
  return refMap;
}

function emitStatement(s: Statement, refMap: Map<string, string>): string {
  switch (s.kind) {
    case "let":
      return `let ${s.name} = ${emitExpr(s.init)}`;
    case "letMut":
      return `let ${s.name} = ${emitExpr(s.init)}`;
    case "assign":
      return `${s.name} = ${emitExpr(s.value)}`;
    case "derefAssign": {
      const targetName =
        s.target.kind === "ident" ? s.target.name : emitExpr(s.target);
      const pointee = refMap.get(targetName) ?? targetName;
      return `${pointee} = ${emitExpr(s.value)}`;
    }
    case "expr":
      return emitExpr(s.value);
  }
}

function checkMutability(
  statements: Statement[],
  finalExpr: Statement,
): CompileError | null {
  const immutable = new Set<string>();
  const mutable = new Set<string>();

  for (const stmt of statements) {
    if (stmt.kind === "let") immutable.add(stmt.name);
    else if (stmt.kind === "letMut") mutable.add(stmt.name);
    else if (stmt.kind === "assign") {
      if (immutable.has(stmt.name) && !mutable.has(stmt.name)) {
        return {
          kind: "type",
          location: { line: 1, column: 1 },
          message: `Cannot assign to immutable variable '${stmt.name}'`,
          fix: `Use 'let mut ${stmt.name}' to declare a mutable variable`,
        };
      }
    }
  }

  if (finalExpr.kind === "assign") {
    if (immutable.has(finalExpr.name) && !mutable.has(finalExpr.name)) {
      return {
        kind: "type",
        location: { line: 1, column: 1 },
        message: `Cannot assign to immutable variable '${finalExpr.name}'`,
        fix: `Use 'let mut ${finalExpr.name}' to declare a mutable variable`,
      };
    }
  }

  return null;
}

function findUnbalancedParen(
  s: string,
): { line: number; column: number } | null {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth < 0) {
      return { line: 1, column: i + 1 };
    }
  }
  if (depth !== 0) {
    return { line: 1, column: s.length };
  }
  return null;
}

function splitStatements(source: string): {
  statements: string[];
  finalExpr: string;
} {
  const parts = splitTopLevel(source, ";");
  const statements = parts
    .slice(0, -1)
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const finalExpr = parts[parts.length - 1]!.trim();
  return { statements, finalExpr };
}

function splitTopLevel(source: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const ch of source) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;

    if (ch === delimiter && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function extractExpression(source: string): string {
  const lines = source.split("\n");
  const exprLines: string[] = [];
  let inModule = false;
  let braceDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (inModule) {
      braceDepth += (trimmed.match(/\{/g) || []).length;
      braceDepth -= (trimmed.match(/\}/g) || []).length;
      if (braceDepth <= 0) inModule = false;
      continue;
    }

    if (trimmed.startsWith("module ")) {
      inModule = true;
      braceDepth =
        (trimmed.match(/\{/g) || []).length -
        (trimmed.match(/\}/g) || []).length;
      continue;
    }
    if (trimmed.startsWith("declare ")) continue;
    if (trimmed.startsWith("in let ")) continue;

    exprLines.push(line);
  }

  return exprLines.join("\n").trim();
}
