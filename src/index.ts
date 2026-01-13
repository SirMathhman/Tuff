export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function interpret(input: string): Result<number, string> {
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();

  if (!trimmed.startsWith("-")) {
    return { ok: true, value: parseFloat(trimmed) };
  }

  const uIndex = upper.lastIndexOf("U");
  if (uIndex === -1) {
    return { ok: true, value: parseFloat(trimmed) };
  }

  const suffix = upper.substring(uIndex + 1);
  if (isNumeric(suffix)) {
    return { ok: false, error: "Unsigned integer cannot be negative" };
  }

  return { ok: true, value: parseFloat(trimmed) };
}

function isNumeric(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const char = str.charAt(i);
    if (char < "0" || char > "9") {
      return false;
    }
  }
  return true;
}
