export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function evaluateTuff(tuffSource: string): Result<number, Error> {
  if (tuffSource === "") {
    return { ok: true, value: 0 };
  }
  return {
    ok: false,
    error: new Error(
      `evaluateTuff: invalid tuff source "${tuffSource}" (only "" is currently supported). ` +
        `Fix: pass a valid tuff source.`,
    ),
  };
}
