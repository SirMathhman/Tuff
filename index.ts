export interface TuffOk {
  ok: true;
  value: number;
}

export interface TuffErr {
  ok: false;
  error: string;
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
  for (const stmt of statements) {
    const [, letName, letValue] = stmt.match(/^let\s+(\w+)\s*=\s*(.+)$/) ?? [];
    if (letName && letValue) {
      const value = resolve(letValue, env);
      if (value === undefined) {
        return { ok: false, error: `Unidentified identifier: ${letValue}` };
      }
      env.set(letName, value);
      continue;
    }
    const [, returnValue] = stmt.match(/^return\s+(.+)$/) ?? [];
    if (returnValue) {
      const value = resolve(returnValue, env);
      if (value === undefined) {
        return { ok: false, error: `Unidentified identifier: ${returnValue}` };
      }
      return { ok: true, value };
    }
  }
  return { ok: true, value: 0 };
}

function resolve(expr: string, env: Map<string, number>): number | undefined {
  const trimmed = expr.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return env.get(trimmed);
}
