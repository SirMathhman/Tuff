export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function evaluateTuff(tuffSource: string): Result<number, Error> {
  if (tuffSource === "") {
    return { ok: true, value: 0 };
  }
  if (/^-?\d+(\.\d+)?$/.test(tuffSource)) {
    return { ok: true, value: Number(tuffSource) };
  }
  return {
    ok: false,
    error: new Error(
      `evaluateTuff: invalid tuff source "${tuffSource}" (expected "" or a number). ` +
        `Fix: pass a valid tuff source.`,
    ),
  };
}
