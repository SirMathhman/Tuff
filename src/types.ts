import { type TuffError } from "./error";
import { type Result, ok, err } from "./result";

function makeError(
  cause: string,
  context: string,
  reason: string,
  fix: string,
): TuffError {
  return { cause, context, reason, fix };
}

export function isInRange(n: number, suffix: string): boolean {
  if (suffix === "U8") return n >= 0 && n <= 255;
  if (suffix === "U16") return n >= 0 && n <= 65535;
  if (suffix === "U32") return n >= 0 && n <= 4294967295;
  if (suffix === "I8") return n >= -128 && n <= 127;
  if (suffix === "I16") return n >= -32768 && n <= 32767;
  if (suffix === "I32") return n >= -2147483648 && n <= 2147483647;
  return true;
}

export function isTypeCompatible(
  sourceSuffix: string,
  targetSuffix: string,
): boolean {
  if (sourceSuffix === "") return true;
  if (targetSuffix === "") return true;
  if (sourceSuffix === targetSuffix) return true;
  if (sourceSuffix === "Bool" || targetSuffix === "Bool") return false;

  const typeOrder: { [key: string]: number } = {
    U8: 0,
    U16: 1,
    U32: 2,
    I8: 0,
    I16: 1,
    I32: 2,
  };
  const typeClass: { [key: string]: string } = {
    U8: "unsigned",
    U16: "unsigned",
    U32: "unsigned",
    I8: "signed",
    I16: "signed",
    I32: "signed",
  };

  if (typeClass[sourceSuffix] !== typeClass[targetSuffix]) {
    return false;
  }

  const sourceOrder = typeOrder[sourceSuffix] || -1;
  const targetOrder = typeOrder[targetSuffix] || -1;
  return sourceOrder <= targetOrder;
}

export function getRangeError(suffix: string): TuffError {
  const rangeMap: { [key: string]: string } = {
    U8: "0-255",
    U16: "0-65535",
    U32: "0-4294967295",
    I8: "-128 to 127",
    I16: "-32768 to 32767",
    I32: "-2147483648 to 2147483647",
  };
  const range = rangeMap[suffix] || "unknown range";
  return makeError(
    "Out of range",
    `Type suffix: ${suffix}`,
    `Value is outside the valid range for ${suffix}: ${range}`,
    `Use a value within the ${suffix} range (${range})`,
  );
}

export function looksLikeNumber(s: string): boolean {
  const trimmed = s.trim();
  let idx = 0;
  if (trimmed.length > 0 && trimmed[0] === "-") {
    idx = 1;
  }
  if (idx >= trimmed.length) return false;
  return trimmed[idx] >= "0" && trimmed[idx] <= "9";
}

export function parseBooleanLiteral(
  s: string,
): Result<{ num: number; suffix: string }, TuffError> {
  const trimmed = s.trim();
  if (trimmed === "true") {
    return ok({ num: 1, suffix: "Bool" });
  }
  if (trimmed === "false") {
    return ok({ num: 0, suffix: "Bool" });
  }
  return err(
    makeError(
      "Invalid boolean",
      `Input: ${trimmed}`,
      "Expected 'true' or 'false'",
      "Use 'true' or 'false' for boolean literals",
    ),
  );
}
