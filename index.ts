console.log("Hello via Bun!");

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function evaluate(input: string): Result<number, Error> {
  if (input.trim() === "") return Ok(0);
  const js = input.replace(/\blet\b(\s+mut\b)?/g, (m, mut) => (mut ? "let" : "const"));
  try {
    const value = new Function(`return (function() { ${js} })();`)();
    return Ok(value);
  } catch (e) {
    return Err(e instanceof Error ? e : new Error(String(e)));
  }
}
