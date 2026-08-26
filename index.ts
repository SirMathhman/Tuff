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

export interface ImmutableAssignmentError {
  kind: "ImmutableAssignment";
  name: string;
  line: number;
}

export type TuffError =
  | UnidentifiedIdentifierError
  | InvalidExpressionError
  | ImmutableAssignmentError;

export interface TuffErr {
  ok: false;
  error: TuffError;
}

export type TuffResult = TuffOk | TuffErr;

export interface Binding {
  value: number;
  mut: boolean;
}

/**
 * Evaluate the tuffness of a string.
 * @param s - The string to evaluate.
 * @returns The tuffness score, or an error if an identifier is not defined.
 */
export function evaluateTuff(s: string): TuffResult {
  const env = new Map<string, Binding>();
  const statements = s
    .split(";")
    .map((st) => st.trim())
    .filter(Boolean);
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;
    const line = i + 1;
    const [, letMut, letName, letValue] =
      stmt.match(/^let\s+(mut\s+)?(\w+)\s*=\s*(.+)$/) ?? [];
    if (letName && letValue) {
      const value = resolveOrError(letValue, env, line);
      if (typeof value !== "number") return { ok: false, error: value };
      env.set(letName, { value, mut: Boolean(letMut) });
      continue;
    }
    const [, returnValue] = stmt.match(/^return\s+(.+)$/) ?? [];
    if (returnValue) {
      const value = resolveOrError(returnValue, env, line);
      if (typeof value !== "number") return { ok: false, error: value };
      return { ok: true, value };
    }
    const [, assignName, assignValue] = stmt.match(/^(\w+)\s*=\s*(.+)$/) ?? [];
    if (assignName && assignValue) {
      const binding = env.get(assignName);
      if (!binding) {
        return {
          ok: false,
          error: { kind: "UnidentifiedIdentifier", name: assignName, line },
        };
      }
      if (!binding.mut) {
        return {
          ok: false,
          error: { kind: "ImmutableAssignment", name: assignName, line },
        };
      }
      const value = resolveOrError(assignValue, env, line);
      if (typeof value !== "number") return { ok: false, error: value };
      env.set(assignName, { ...binding, value });
      continue;
    }
  }
  return { ok: true, value: 0 };
}

function resolveOrError(
  expr: string,
  env: Map<string, Binding>,
  line: number,
): number | TuffError {
  const trimmed = expr.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^\w+$/.test(trimmed)) {
    const binding = env.get(trimmed);
    if (binding) return binding.value;
    return { kind: "UnidentifiedIdentifier", name: trimmed, line };
  }
  return { kind: "InvalidExpression", expression: trimmed, line };
}
