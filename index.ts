export interface TuffError {
  kind: "InvalidSyntax";
  source: string;
}

export interface Success<T> {
  ok: true;
  value: T;
}

export interface Failure<E> {
  ok: false;
  error: E;
}

export type Result<T, E> = Success<T> | Failure<E>;

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isSpace(c: string): boolean {
  return c.length === 1 && c.trim() === "";
}

// Grammar: [sign] digits ( ws* ("+" | "-") ws* [sign] digits )*, where a sign
// must touch its digits and the whole source is trimmed first.
export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const s = tuffSource.trim();
  const invalid: Failure<TuffError> = {
    ok: false,
    error: { kind: "InvalidSyntax", source: tuffSource },
  };
  let pos = 0;
  let total = 0;
  let termSign = 1; // sign from the binary operator before the next term
  for (;;) {
    let sign = termSign;
    const c = s.charAt(pos);
    if (c === "+" || c === "-") {
      if (c === "-") sign = -sign;
      pos++;
    }

    const start = pos;
    while (isDigit(s.charAt(pos))) pos++;
    if (pos === start) return invalid;
    total += sign * parseInt(s.slice(start, pos), 10);

    while (isSpace(s.charAt(pos))) pos++;
    if (pos === s.length) return { ok: true, value: total };

    const op = s.charAt(pos);
    if (op !== "+" && op !== "-") return invalid;
    termSign = op === "-" ? -1 : 1;
    pos++;
    while (isSpace(s.charAt(pos))) pos++;
  }
}
