export type TuffError = { kind: "InvalidSyntax"; source: string };

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

const EXPRESSION = /^\s*[+-]?\d+(\s*[+-]\s*[+-]?\d+)*\s*$/;

export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  if (!EXPRESSION.test(tuffSource)) {
    return { ok: false, error: { kind: "InvalidSyntax", source: tuffSource } };
  }

  // Each number's sign is the product of the +/- characters directly before it.
  let sign = 1;
  let total = 0;
  for (const token of tuffSource.match(/[+-]|\d+/g) ?? []) {
    if (token === "-") sign = -sign;
    else if (token !== "+") {
      total += sign * parseInt(token, 10);
      sign = 1;
    }
  }
  return { ok: true, value: total };
}
