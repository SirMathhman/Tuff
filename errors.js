/**
 * Structured error taxonomy for tuff.
 *
 * Every error answers four questions:
 * - what: `kind` (a member of TuffErrorKind)
 * - where: `input` (the offending input)
 * - why: `reason`
 * - what makes it go away: `remedy`
 */
export const TuffErrorKind = Object.freeze({
  SyntaxError: "SyntaxError",
  RuntimeError: "RuntimeError",
});

export function makeError(kind, input, reason, remedy) {
  return Object.freeze({ kind, input, reason, remedy });
}
