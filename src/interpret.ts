/**
 * Interpret a string and return a number.
 * Minimal rules for now:
 * - empty or whitespace-only -> 0
 * - numeric literal (integer or float) -> parsed number
 * - bare identifier (letters, digits, underscores, not starting with digit) -> throw Undefined identifier error
 * - otherwise -> throw generic interpretation error
 */
export function interpret(input: string): number {
  const s = input.trim();
  if (s === "") return 0;

  // pure numeric literal
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);

  // bare identifiers -> undefined
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) {
    throw new Error(`Undefined identifier: ${s}`);
  }

  // tokenize numbers and operators
  const tokenRe = /\d+(?:\.\d+)?|[+\-*/]/g;
  const raw = s.match(tokenRe);
  if (!raw) throw new Error("Unable to interpret input");

  // ensure no unexpected characters
  if (s.replace(/\s+/g, "").match(/[^+\-*/0-9.]/)) {
    throw new Error("Unable to interpret input");
  }

  type Token = { type: "num"; value: number } | { type: "op"; value: string };
  const tokens: Token[] = raw.map((t) => {
    if (/^[+\-*/]$/.test(t)) return { type: "op", value: t };
    return { type: "num", value: Number(t) };
  });

  let idx = 0;
  const peek = () => tokens[idx];
  const consume = () => tokens[idx++];

  function parseFactor(): number {
    const tk = peek();
    if (!tk) throw new Error("Unable to interpret input");
    if (tk.type === "op" && tk.value === "-") {
      consume();
      return -parseFactor();
    }
    if (tk.type === "num") {
      consume();
      return tk.value;
    }
    throw new Error("Unable to interpret input");
  }

  function parseTerm(): number {
    let val = parseFactor();
    while (
      peek() &&
      peek().type === "op" &&
      (peek().value === "*" || peek().value === "/")
    ) {
      const op = consume().value;
      const rhs = parseFactor();
      if (op === "*") val = val * rhs;
      else val = val / rhs;
    }
    return val;
  }

  function parseExpr(): number {
    let val = parseTerm();
    while (
      peek() &&
      peek().type === "op" &&
      (peek().value === "+" || peek().value === "-")
    ) {
      const op = consume().value;
      const rhs = parseTerm();
      if (op === "+") val = val + rhs;
      else val = val - rhs;
    }
    return val;
  }

  const result = parseExpr();
  if (idx !== tokens.length) throw new Error("Unable to interpret input");
  if (!Number.isFinite(result)) throw new Error("Unable to interpret input");
  return result;
}
