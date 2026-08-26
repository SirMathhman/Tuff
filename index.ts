/**
 * Evaluate the tuffness of a string.
 * @param s - The string to evaluate.
 * @returns The tuffness score.
 */
export function evaluateTuff(s: string): number {
  const env = new Map<string, number>();
  const statements = s
    .split(";")
    .map((st) => st.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    const [, letName, letValue] = stmt.match(/^let\s+(\w+)\s*=\s*(.+)$/) ?? [];
    if (letName && letValue) {
      env.set(letName, resolve(letValue, env));
      continue;
    }
    const [, returnValue] = stmt.match(/^return\s+(.+)$/) ?? [];
    if (returnValue) {
      return resolve(returnValue, env);
    }
  }
  return 0;
}

function resolve(expr: string, env: Map<string, number>): number {
  const trimmed = expr.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return env.get(trimmed) ?? 0;
}
