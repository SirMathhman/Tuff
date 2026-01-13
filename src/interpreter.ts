export function interpret(input: string): number {
  const n = Number(input);
  if (!Number.isNaN(n)) return n;

  // Extract a leading numeric chunk using string parsing (avoid regex)
  let i = 0;
  const len = input.length;

  const isSign = (c: string | undefined) => c === "+" || c === "-";
  // optional sign
  if (isSign(input[i])) i++;

  let seenDigit = false;
  let seenDot = false;

  while (i < len) {
    const ch = input[i];
    if (ch >= "0" && ch <= "9") {
      seenDigit = true;
      i++;
      continue;
    }

    if (ch === "." && !seenDot) {
      seenDot = true;
      i++;
      continue;
    }

    break;
  }

  if (!seenDigit) return NaN;

  const numPart = input.slice(0, i);
  const rest = input.slice(i);

  // Handle suffix (if present)
  const suffix = rest.trim();
  if (suffix.length === 0) return parseFloat(numPart);

  // Bounds for integer suffixes (use BigInt for accuracy)
  const bounds: Record<string, [bigint, bigint]> = {
    U8: [BigInt(0), BigInt(255)],
    U16: [BigInt(0), BigInt(65535)],
    U32: [BigInt(0), BigInt(4294967295)],
    U64: [BigInt(0), BigInt("18446744073709551615")],
    I8: [BigInt(-128), BigInt(127)],
    I16: [BigInt(-32768), BigInt(32767)],
    I32: [BigInt(-2147483648), BigInt(2147483647)],
    I64: [BigInt("-9223372036854775808"), BigInt("9223372036854775807")],
  };

  const range = bounds[suffix];
  if (range === undefined) return NaN;

  // Ensure numPart is an integer string (no decimals, no exponents)
  let j = 0;
  if (numPart[j] === "+" || numPart[j] === "-") {
    j = j + 1;
  }
  if (j === numPart.length) return NaN; // sign only
  for (; j < numPart.length; j++) {
    const ch = numPart[j];
    if (ch < "0" || ch > "9") return NaN;
  }

  const big = BigInt(numPart);
  const [min, max] = range;
  const outOfRange = (v: bigint, a: bigint, b: bigint) => v < a || v > b;
  if (outOfRange(big, min, max)) return NaN;

  // Ensure number fits in JS safe integer range before converting to Number
  const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  if (outOfRange(big, minSafe, maxSafe)) return NaN;

  return Number(big);
}
