import vm from "node:vm";
import { TuffErrorKind, makeError } from "./errors.js";

const EVAL_TIMEOUT_MS = 1000;

/**
 * Evaluate a Tuff input (a JavaScript function-body snippet) to a value.
 *
 * Returns a Result: `{ ok: true, value }` or `{ ok: false, error }`.
 * Never throws. Empty input evaluates to `0`.
 * Evaluation runs in a fresh `vm` context with no access to host globals.
 */
export function evaluateTuff(input) {
  if (input === "") {
    return { ok: true, value: 0 };
  }

  const context = vm.createContext({});
  const script = `(() => { ${input} })()`;

  try {
    const value = vm.runInContext(script, context, {
      timeout: EVAL_TIMEOUT_MS,
    });
    return { ok: true, value };
  } catch (err) {
    const kind =
      err?.name === "SyntaxError"
        ? TuffErrorKind.SyntaxError
        : TuffErrorKind.RuntimeError;
    const error = makeError(
      kind,
      input,
      err instanceof Error ? err.message : String(err),
      kind === TuffErrorKind.SyntaxError
        ? "Fix the syntax of the input snippet."
        : "Fix the runtime error in the input snippet (e.g., undefined identifiers).",
    );
    return { ok: false, error };
  }
}
