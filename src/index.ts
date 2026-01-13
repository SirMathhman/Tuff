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
  const plusIndex = input.indexOf(" + ");
  if (plusIndex !== -1) {
    return handleAddition(input, plusIndex);
  }
  return interpretOperand(input);
}

function handleAddition(input: string, index: number): Result<number, string> {
  const left = interpret(input.substring(0, index));
  if (!left.ok) {
    return left;
  }
  const right = interpret(input.substring(index + 3));
  if (!right.ok) {
    return right;
  }
  return { ok: true, value: left.value + right.value };
}

function interpretOperand(input: string): Result<number, string> {
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();

  const suffixInfo = getSuffixInfo(upper);
  if (!suffixInfo.found) {
    return { ok: true, value: parseFloat(trimmed) };
  }

  const { type, bitDepth, index } = suffixInfo;
  const numericPart = trimmed.substring(0, index);

  if (!isValidInteger(numericPart)) {
    return { ok: true, value: parseFloat(trimmed) };
  }

  if (type === "U" && numericPart.includes("-")) {
    return { ok: false, error: "Unsigned integer cannot be negative" };
  }

  const bigValue = BigInt(numericPart);
  if (!isInRange(bigValue, type, bitDepth)) {
    return {
      ok: false,
      error: `Value ${bigValue} is out of range for ${type}${bitDepth}`,
    };
  }

  return { ok: true, value: Number(bigValue) };
}

function isValidInteger(str: string): boolean {
  if (str.length === 0) {
    return false;
  }
  let start = 0;
  if (str.charAt(0) === "-" || str.charAt(0) === "+") {
    start = 1;
  }
  return start < str.length && isNumeric(str.substring(start));
}

interface SuffixInfo {
  found: boolean;
  type: string;
  bitDepth: number;
  index: number;
}

function getSuffixInfo(upper: string): SuffixInfo {
  const uIndex = upper.lastIndexOf("U");
  const iIndex = upper.lastIndexOf("I");
  const index = Math.max(uIndex, iIndex);
  const failure: SuffixInfo = {
    found: false,
    type: "",
    bitDepth: 0,
    index: -1,
  };

  if (index === -1) {
    return failure;
  }

  const suffixStr = upper.substring(index + 1);
  if (!isNumeric(suffixStr) || suffixStr.length === 0) {
    return failure;
  }

  return {
    found: true,
    type: upper.charAt(index),
    bitDepth: parseInt(suffixStr, 10),
    index,
  };
}

function isInRange(value: bigint, type: string, bitDepth: number): boolean {
  if (type === "U") {
    const max = BigInt(2) ** BigInt(bitDepth);
    return value >= 0 && value < max;
  }
  const limit = BigInt(2) ** BigInt(bitDepth - 1);
  return value >= -limit && value < limit;
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
