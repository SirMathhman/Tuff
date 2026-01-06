/**
 * Interpret a string and return a Result<number, InterpretError>.
 * Use Result<T, E> instead of throwing errors.
 * Minimal rules for now:
 * - empty or whitespace-only -> 0
 * - numeric literal (integer or float) -> parsed number
 * - identifiers -> UndefinedIdentifier error
 * - otherwise -> InvalidInput error
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type UndefinedIdentifierError = {
  type: "UndefinedIdentifier";
  identifier: string;
};
export type InvalidInputError = { type: "InvalidInput"; message: string };
export type InterpretError = UndefinedIdentifierError | InvalidInputError;

const ok = <T, E>(value: T): Result<T, E> => ({ ok: true, value });
const err = <T, E>(error: E): Result<T, E> => ({ ok: false, error });

export function interpret(input: string): Result<number, InterpretError> {
  const s = input.trim();
  if (s === "") return ok(0);

  // numeric literal (integer or decimal)
  if (/^-?\d+(?:\.\d+)?$/.test(s)) {
    return ok(Number(s));
  }

  // bare identifiers -> undefined identifier error
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) {
    return err({ type: "UndefinedIdentifier", identifier: s });
  }

  // tokenize numbers and operators
  const tokenRe = /\d+(?:\.\d+)?|[+\-*/]/g;
  const raw = s.match(tokenRe);
  if (!raw)
    return err({ type: "InvalidInput", message: "Unable to interpret input" });

  // ensure no unexpected characters
  if (s.replace(/\s+/g, "").match(/[^+\-*/0-9.]/)) {
    return err({ type: "InvalidInput", message: "Unable to interpret input" });
  }

  type Token = { type: "num"; value: number } | { type: "op"; value: string };
  const tokens: Token[] = raw.map((t) => {
    if (/^[+\-*/]$/.test(t)) return { type: "op", value: t };
    return { type: "num", value: Number(t) };
  });

  let idx = 0;
  const peek = () => tokens[idx];
  const consume = () => tokens[idx++];

  function parseFactor(): Result<number, InterpretError> {
    const tk = peek();
    if (!tk)
      return err({
        type: "InvalidInput",
        message: "Unable to interpret input",
      });
    if (tk.type === "op" && tk.value === "-") {
      consume();
      const r = parseFactor();
      return r.ok ? ok(-r.value) : err(r.error);
    }
    if (tk.type === "num") {
      consume();
      return ok(tk.value);
    }
    return err({ type: "InvalidInput", message: "Unable to interpret input" });
  }

  function parseTerm(): Result<number, InterpretError> {
    const left = parseFactor();
    if (!left.ok) return left;
    let val = left.value;
    while (
      peek() &&
      peek().type === "op" &&
      (peek().value === "*" || peek().value === "/")
    ) {
      const op = consume().value;
      const right = parseFactor();
      if (!right.ok) return right;
      const rhs = right.value;
      val = op === "*" ? val * rhs : val / rhs;
    }
    return ok(val);
  }

  function parseExpr(): Result<number, InterpretError> {
    const left = parseTerm();
    if (!left.ok) return left;
    let val = left.value;
    while (
      peek() &&
      peek().type === "op" &&
      (peek().value === "+" || peek().value === "-")
    ) {
      const op = consume().value;
      const right = parseTerm();
      if (!right.ok) return right;
      const rhs = right.value;
      val = op === "+" ? val + rhs : val - rhs;
    }
    return ok(val);
  }

  const result = parseExpr();
  if (!result.ok) return result;
  if (idx !== tokens.length)
    return err({ type: "InvalidInput", message: "Unable to interpret input" });
  if (!Number.isFinite(result.value))
    return err({ type: "InvalidInput", message: "Unable to interpret input" });
  return result;
}
