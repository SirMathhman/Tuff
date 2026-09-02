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

  const lines = parsedStatements.map((s) => `${emitStatement(s)};`);
  lines.push(`process.exit(${emitStatement(parsedFinal)});`);
  return { ok: true, value: lines.join("\n") };
}

type Statement =
  | { kind: "let"; name: string; init: string }
  | { kind: "letMut"; name: string; init: string }
  | { kind: "assign"; name: string; value: string }
  | { kind: "expr"; text: string };

function parseStatement(s: string): Statement {
  const trimmed = s.trim();
  const letMutMatch = trimmed.match(/^let\s+mut\s+(\w+)\s*=\s*(.*)$/);
  if (letMutMatch) {
    return { kind: "letMut", name: letMutMatch[1]!, init: letMutMatch[2]! };
  }
  const letMatch = trimmed.match(/^let\s+(\w+)\s*=\s*(.*)$/);
  if (letMatch) {
    return { kind: "let", name: letMatch[1]!, init: letMatch[2]! };
  }
  const assignMatch = trimmed.match(/^(\w+)\s*=\s*(.*)$/);
  if (assignMatch) {
    return { kind: "assign", name: assignMatch[1]!, value: assignMatch[2]! };
  }
  return { kind: "expr", text: trimmed };
}

function emitStatement(s: Statement): string {
  switch (s.kind) {
    case "let":
      return `let ${s.name} = ${s.init}`;
    case "letMut":
      return `let ${s.name} = ${s.init}`;
    case "assign":
      return `${s.name} = ${s.value}`;
    case "expr":
      return s.text;
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
