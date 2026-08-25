/**
 * Evaluate the tuffness of a string.
 *
 * @param input - The string to evaluate.
 * @returns The tuffness score.
 */
export function evaluateTuff(input: string): number {
  const vars = new Map<string, number>();
  const stmts = input
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of stmts) {
    const decl = /^let\s+(\w+)\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(stmt);
    if (decl?.[1] !== undefined && decl[2] !== undefined) {
      vars.set(decl[1], Number(decl[2]));
      continue;
    }
    const ret = /^return\s+(.+)$/.exec(stmt);
    if (ret?.[1] !== undefined) {
      const expr = ret[1].trim();
      const num = /^-?\d+(?:\.\d+)?$/.exec(expr);
      if (num) return Number(num);
      return vars.get(expr) ?? 0;
    }
  }
  return 0;
}
