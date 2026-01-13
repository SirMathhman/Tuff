// Top-level integer bounds map
const INT_BOUNDS = (() => {
  const m = new Map<string, [bigint, bigint]>();
  for (const bits of [8, 16, 32, 64]) {
    const max = (BigInt(1) << BigInt(bits)) - BigInt(1);
    m.set(`U${bits}`, [BigInt(0), max]);
  }
  for (const bits of [8, 16, 32, 64]) {
    const shift = BigInt(1) << BigInt(bits - 1);
    m.set(`I${bits}`, [-shift, shift - BigInt(1)]);
  }
  return m;
})();

const outOfRange = (v: bigint, a: bigint, b: bigint) => v < a || v > b;

function extractSuffix(input: string): string | undefined {
  const parsed = extractLeadingNumeric(input);
  if (!parsed) return undefined;
  const s = parsed.rest.trim();
  return s.length === 0 ? "none" : s;
}

function interpretAdditive(input: string): number {
  const parts = input.split("+");
  let sum = 0;
  let firstSuffix: string | undefined = undefined;
  for (const part of parts) {
    const trimmed = part.trim();
    const currentSuffix = extractSuffix(trimmed);
    if (firstSuffix === undefined) firstSuffix = currentSuffix;
    if (currentSuffix !== firstSuffix) return NaN;
    const val = interpret(trimmed);
    if (Number.isNaN(val)) return NaN;
    sum += val;
  }
  return sum;
}

function extractLeadingNumeric(
  input: string
): { numPart: string; rest: string } | undefined {
  let i = 0;
  const len = input.length;
  const isSign = (c?: string) => c === "+" || c === "-";
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
  if (!seenDigit) return undefined;
  return { numPart: input.slice(0, i), rest: input.slice(i) };
}

function validateIntegerSuffix(numPart: string, suffix: string): number {
  const range = INT_BOUNDS.get(suffix);
  if (range === undefined) return NaN;

  // ensure integer-only string
  let j = 0;
  if (numPart[j] === "+" || numPart[j] === "-") j++;
  if (j === numPart.length) return NaN;
  for (; j < numPart.length; j++) {
    const ch = numPart[j];
    if (ch < "0" || ch > "9") return NaN;
  }

  try {
    const big = BigInt(numPart);
    const [min, max] = range;
    if (outOfRange(big, min, max)) return NaN;
    const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    if (outOfRange(big, minSafe, maxSafe)) return NaN;
    return Number(big);
  } catch {
    return NaN;
  }
}

export function interpret(input: string): number {
  if (input.includes("+")) return interpretAdditive(input);

  const n = Number(input);
  if (!Number.isNaN(n)) return n;

  const parsed = extractLeadingNumeric(input);
  if (!parsed) return NaN;
  const { numPart, rest } = parsed;

  const suffix = rest.trim();
  if (suffix.length === 0) return parseFloat(numPart);

  return validateIntegerSuffix(numPart, suffix);
}
