/**
 * Evaluate an expression.
 * @param expression - The expression to evaluate.
 * @returns The numeric result of the expression.
 */
const NUMBER = "-?\\d+(?:\\.\\d+)?";
const LET_RE = new RegExp(`^\\s*let\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(${NUMBER})\\s*$`);
const RETURN_RE = new RegExp(`^\\s*return\\s+(${NUMBER}|[A-Za-z_$][\\w$]*)\\s*$`);

export function evaluate(expression: string): number {
  // Stub: handles `let <name> = <number>;` and `return <number|name>;`
  // statements; returns 0 for anything else.
  const variables = new Map<string, number>();
  for (const rawStatement of expression.split(";")) {
    const statement = rawStatement.trim();
    if (statement === "") {
      continue;
    }
    const letMatch = LET_RE.exec(statement);
    if (letMatch) {
      variables.set(letMatch[1], Number(letMatch[2]));
      continue;
    }
    const returnMatch = RETURN_RE.exec(statement);
    if (returnMatch) {
      const value = returnMatch[1];
      return variables.has(value) ? variables.get(value)! : Number(value);
    }
    return 0;
  }
  return 0;
}
