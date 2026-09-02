export function compileTuffToTypeScript(tuffSource: string): string {
  const expr = extractExpression(tuffSource);
  if (expr === "") {
    return "process.exit(0);";
  }

  const { statements, finalExpr } = splitStatements(expr);
  const lines = statements.map((s) => `${s};`);
  lines.push(`process.exit(${finalExpr});`);
  return lines.join("\n");
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
