import type { TuffError } from "./errors.ts";

/**
 * A successful evaluation result.
 */
export interface Ok {
  ok: true;
  value: number;
}

/**
 * A failed evaluation result.
 */
export interface Err {
  ok: false;
  error: TuffError;
}

/**
 * The result of an evaluation: either a numeric value or a structured error.
 */
export type Result = Ok | Err;

/**
 * Evaluate the tuffness of a string.
 *
 * @param input - The string to evaluate.
 * @returns The tuffness score or a structured error.
 */
export function evaluateTuff(input: string): Result {
  const vars = new Map<string, number>();
  const stmts = input
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of stmts) {
    const decl = /^let\s+(?:mut\s+)?(\w+)\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(stmt);
    if (decl?.[1] !== undefined && decl[2] !== undefined) {
      vars.set(decl[1], Number(decl[2]));
      continue;
    }
    const assign = /^(\w+)\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(stmt);
    if (assign?.[1] !== undefined && assign[2] !== undefined) {
      vars.set(assign[1], Number(assign[2]));
      continue;
    }
    const ret = /^return\s+(.+)$/.exec(stmt);
    if (ret?.[1] !== undefined) {
      const expr = ret[1].trim();
      const num = /^-?\d+(?:\.\d+)?$/.exec(expr);
      if (num) return { ok: true, value: Number(num) };
      const val = vars.get(expr);
      if (val !== undefined) return { ok: true, value: val };
      return { ok: false, error: { type: "UnknownIdentifier", name: expr } };
    }
  }
  return { ok: true, value: 0 };
}
