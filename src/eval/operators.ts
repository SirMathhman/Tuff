/**
 * Binary operators and truthiness checks for the Tuff interpreter.
 * Extracted from eval.ts to comply with max-lines ESLint rule.
 */
import {
  isBoolOperand,
  isFloatOperand,
  isIntOperand,
  isThisBinding,
  hasKindBits,
  getProp,
  checkRange,
  type RuntimeValue,
} from "../types";

interface BooleanResult {
  boolValue: boolean;
}

interface TypedIntegerResult {
  valueBig: bigint;
  kind: string;
  bits: number;
}

interface SuffixCompatibilityCtx {
  left: RuntimeValue;
  right: RuntimeValue;
  leftHasKind: boolean;
  rightHasKind: boolean;
}

interface TypedIntegerOpCtx {
  op: string;
  left: RuntimeValue;
  right: RuntimeValue;
  leftHasKind: boolean;
  rightHasKind: boolean;
}

export function isTruthy(val: unknown): boolean {
  if (isBoolOperand(val)) return val.boolValue;
  if (isIntOperand(val)) return val.valueBig !== 0n;
  if (typeof val === "number") return val !== 0;
  if (isFloatOperand(val)) return val.floatValue !== 0;
  return false;
}

/**
 * Check if a value matches a type expression (used by the `is` operator)
 */
function checkTypeMatch(leftVal: unknown, tExpr: string): boolean {
  const parts = tExpr
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of parts) {
    const intMatch = p.match(/^([uUiI])(\d+)$/);
    if (intMatch) {
      if (matchesIntegerTypePart(leftVal, intMatch)) return true;
      continue;
    }

    if (/^bool$/i.test(p)) {
      if (isBoolOperand(leftVal)) return true;
      continue;
    }

    if (matchesStructOrThisBinding(leftVal, p)) return true;
  }
  return false;
}

function matchesIntegerTypePart(leftVal: unknown, intMatch: RegExpMatchArray) {
  const kind = intMatch[1] === "u" || intMatch[1] === "U" ? "u" : "i";
  const bits = Number(intMatch[2]);
  if (isIntOperand(leftVal)) {
    if (hasKindBits(leftVal))
      return leftVal.kind === kind && leftVal.bits === bits;
    try {
      checkRange(kind, bits, leftVal.valueBig);
      return true;
    } catch {
      return false;
    }
  }
  if (typeof leftVal === "number" && Number.isInteger(leftVal)) {
    try {
      checkRange(kind, bits, BigInt(leftVal));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function matchesStructOrThisBinding(leftVal: unknown, p: string) {
  const sname = getProp(leftVal, "structName");
  if (typeof sname === "string" && sname === p) return true;
  if (
    isThisBinding(leftVal) &&
    Object.prototype.hasOwnProperty.call(leftVal.fieldValues, p)
  )
    return true;
  return false;
}

/**
 * Handle the `is` type test operator
 */
function handleIsOperator(left: unknown, right: unknown): BooleanResult {
  // Accept either a literal type name, a placeholder { typeName }, or a binding
  // that stores `typeAlias` from a `type` declaration.
  let typeExpr: string | undefined = undefined;
  if (typeof right === "string") typeExpr = right;
  else if (
    getProp(right, "typeName") &&
    typeof getProp(right, "typeName") === "string"
  )
    typeExpr = String(getProp(right, "typeName"));
  else if (
    getProp(right, "typeAlias") &&
    typeof getProp(right, "typeAlias") === "string"
  )
    typeExpr = String(getProp(right, "typeAlias"));
  if (!typeExpr) throw new Error("invalid type in is expression");
  const tnRaw = typeExpr.trim();

  return { boolValue: checkTypeMatch(left, tnRaw) };
}

/**
 * Ensure suffix metadata and compatibility between typed integer operands
 */
function ensureSuffixCompatibility(ctx: SuffixCompatibilityCtx) {
  const ref = ctx.leftHasKind ? ctx.left : ctx.right;
  if (!hasKindBits(ref)) throw new Error("invalid suffix metadata");
  const { kind, bits } = ref;
  if (ctx.leftHasKind && ctx.rightHasKind) {
    if (!hasKindBits(ctx.left) || !hasKindBits(ctx.right))
      throw new Error("invalid suffix metadata");
    if (ctx.left.kind !== ctx.right.kind || ctx.left.bits !== ctx.right.bits)
      throw new Error("mismatched suffixes in binary operation");
  }
  if (!ctx.leftHasKind && isFloatOperand(ctx.left))
    throw new Error("mixed suffix and float not allowed");
  if (!ctx.rightHasKind && isFloatOperand(ctx.right))
    throw new Error("mixed suffix and float not allowed");
  return { kind, bits };
}

function getBigValue(val: unknown, hasKind: boolean, side: "left" | "right") {
  if (typeof val === "number") {
    if (hasKind === true)
      throw new Error(`invalid typed integer ${side} operand`);
    return BigInt(val);
  }
  if (!isIntOperand(val)) throw new Error(`invalid ${side} integer operand`);
  return val.valueBig;
}

/**
 * Handle typed integer operations (with kind/bits metadata)
 */
function handleTypedIntegerOp(ctx: TypedIntegerOpCtx): TypedIntegerResult {
  const { kind, bits } = ensureSuffixCompatibility({
    left: ctx.left,
    right: ctx.right,
    leftHasKind: ctx.leftHasKind,
    rightHasKind: ctx.rightHasKind,
  });

  const lBig = getBigValue(ctx.left, ctx.leftHasKind, "left");
  const rBig = getBigValue(ctx.right, ctx.rightHasKind, "right");

  let resBig: bigint;
  if (ctx.op === "+") resBig = lBig + rBig;
  else if (ctx.op === "-") resBig = lBig - rBig;
  else if (ctx.op === "*") resBig = lBig * rBig;
  else if (ctx.op === "/") {
    if (rBig === 0n) throw new Error("division by zero");
    resBig = lBig / rBig;
  } else if (ctx.op === "%") {
    if (rBig === 0n) throw new Error("modulo by zero");
    resBig = lBig % rBig;
  } else throw new Error("unsupported operator");

  checkRange(kind, bits, resBig);
  return { valueBig: resBig, kind, bits };
}

/**
 * Convert an operand to a numeric value for untyped operations
 */
function toNumericValue(val: unknown, side: "left" | "right"): number {
  if (typeof val === "number") return val;
  if (isFloatOperand(val)) return val.floatValue;
  if (isBoolOperand(val)) return val.boolValue ? 1 : 0;
  if (isIntOperand(val)) return Number(val.valueBig);
  throw new Error(`invalid ${side} operand`);
}

// Exported helper to apply a binary arithmetic operator to two operands using the same rules
export function applyBinaryOp(
  op: string,
  left: unknown,
  right: unknown
): unknown {
  if (op === "||") {
    if (isTruthy(left)) return { boolValue: true };
    return { boolValue: isTruthy(right) };
  }
  if (op === "&&") {
    if (!isTruthy(left)) return { boolValue: false };
    return { boolValue: isTruthy(right) };
  }

  // Support a runtime type test operator `is` (e.g., `x is I32`).
  if (op === "is") {
    return handleIsOperator(left, right);
  }

  const leftHasKind = hasKindBits(left);
  const rightHasKind = hasKindBits(right);
  if (leftHasKind || rightHasKind) {
    return handleTypedIntegerOp({
      op,
      left,
      right,
      leftHasKind,
      rightHasKind,
    });
  }

  const lNum = toNumericValue(left, "left");
  const rNum = toNumericValue(right, "right");

  return performNumericOp(op, lNum, rNum);
}

function performNumericOp(op: string, lNum: number, rNum: number) {
  if (op === "+") return lNum + rNum;
  if (op === "-") return lNum - rNum;
  if (op === "*") return lNum * rNum;
  if (op === "/") return lNum / rNum;
  if (op === "%") return lNum % rNum;
  if (op === "<") return { boolValue: lNum < rNum };
  if (op === ">") return { boolValue: lNum > rNum };
  if (op === "<=") return { boolValue: lNum <= rNum };
  if (op === ">=") return { boolValue: lNum >= rNum };
  if (op === "==") return { boolValue: lNum == rNum };
  if (op === "!=") return { boolValue: lNum != rNum };
  throw new Error("unsupported operator");
}
