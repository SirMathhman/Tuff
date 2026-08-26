export interface TuffOk {
  ok: true;
  value: number;
}

export interface UnidentifiedIdentifierError {
  kind: "UnidentifiedIdentifier";
  name: string;
  line: number;
}

export interface InvalidExpressionError {
  kind: "InvalidExpression";
  expression: string;
  line: number;
}

export type TuffError = UnidentifiedIdentifierError | InvalidExpressionError;

export interface TuffErr {
  ok: false;
  error: TuffError;
}

export type TuffResult = TuffOk | TuffErr;

/**
 * Evaluate the tuffness of a string.
 * @param s - The string to evaluate.
 * @returns The tuffness score, or an error if an identifier is not defined.
 */
export function evaluateTuff(s: string): TuffResult {
  const env = new Map<string, number>();
  const statements = s
    .split(";")
    .map((st) => st.trim())
    .filter(Boolean);
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;
    const line = i + 1;
    const [, letName, letValue] = stmt.match(/^let\s+(\w+)\s*=\s*(.+)$/) ?? [];
    if (letName && letValue) {
      const value = resolveOrError(letValue, env, line);
      if (typeof value !== "number") return { ok: false, error: value };
      env.set(letName, value);
      continue;
    }
    const [, returnValue] = stmt.match(/^return\s+(.+)$/) ?? [];
    if (returnValue) {
      const value = resolveOrError(returnValue, env, line);
      if (typeof value !== "number") return { ok: false, error: value };
      return { ok: true, value };
    }
  }
  return { ok: true, value: 0 };
}

function resolveOrError(
  expr: string,
  env: Map<string, number>,
  line: number,
): number | TuffError {
  const trimmed = expr.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^\w+$/.test(trimmed)) {
    const value = env.get(trimmed);
    if (value !== undefined) return value;
    return { kind: "UnidentifiedIdentifier", name: trimmed, line };
  }
  return { kind: "InvalidExpression", expression: trimmed, line };
}
