export interface Success<T> {
  ok: true;
  value: T;
}

export interface Failure<E> {
  ok: false;
  error: E;
}

export type Result<T, E> = Success<T> | Failure<E>;

export function interpret(input: string): Result<number, string> {
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  const value = parseFloat(trimmed);

  const uIndex = upper.lastIndexOf("U");
  if (uIndex === -1) {
    return { ok: true, value };
  }

  const suffix = upper.substring(uIndex + 1);
  if (!isNumeric(suffix)) {
    return { ok: true, value };
  }

  if (trimmed.startsWith("-")) {
    return { ok: false, error: "Unsigned integer cannot be negative" };
  }

  const bitDepth = parseInt(suffix || "0", 10);
  if (bitDepth > 0 && value >= Math.pow(2, bitDepth)) {
    return {
      ok: false,
      error: `Value ${value} is out of range for U${bitDepth}`,
    };
  }

  return { ok: true, value };
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
