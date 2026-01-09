import { Env, envGet } from "../env";
import {
  getFieldValueFromInstance,
  getArrayElementFromInstance,
  throwCannotAccessField,
  throwCannotAccessFieldMissing,
} from "./pure_helpers";
import { makeBoundWrapperFromOrigFn } from "./functions";
import {
  isPlainObject,
  isStructInstance,
  isThisBinding,
  isPointer,
  hasCallApp,
  getProp,
  isArrayInstance,
  isFnWrapper,
} from "../types";
import { convertOperandToNumber } from "../interpret_helpers";

interface BindingTarget {
  binding: unknown;
  targetVal: unknown;
}

interface OperandIndexResult {
  index: number;
  isLeft: boolean;
}

interface BigIntValue {
  valueBig: bigint;
}

interface ProcessOperatorsCtx {
  operands: unknown[];
  ops: string[];
  localEnv: Env;
  evaluateReturningOperandFn: (expr: string, env: Env) => unknown;
  evaluateCallAtFn: (funcOperand: unknown, callAppOperand: unknown) => unknown;
  getBindingTargetFn: (name: string) => BindingTarget;
}

function replaceWithBigIntNumber(
  ctx: ProcessOperatorsCtx,
  n: number,
  i: number
) {
  const val: BigIntValue = { valueBig: BigInt(n) };
  ctx.operands.splice(i, 2, val);
  ctx.ops.splice(i, 1);
}

function findNearbyOperandIndex(
  operands: unknown[],
  i: number,
  predicate: (v: unknown) => boolean
): OperandIndexResult | undefined {
  for (let j = i - 1; j >= 0; j--) {
    if (operands[j] !== undefined) {
      if (predicate(operands[j])) return { index: j, isLeft: true };
    }
  }
  for (let j = i + 1; j < operands.length; j++) {
    if (operands[j] !== undefined) {
      if (predicate(operands[j])) return { index: j, isLeft: false };
    }
  }
  return undefined;
}

function tryResolveMissingIndex(
  ctx: ProcessOperatorsCtx,
  i: number,
  idxVal: number
): boolean {
  const found = findNearbyOperandIndex(
    ctx.operands,
    i,
    (maybe) => isArrayInstance(maybe) || isThisBinding(maybe)
  );
  if (!found) return false;
  const maybe = ctx.operands[found.index];
  const elem = getArrayElementFromInstance(maybe, idxVal);
  if (found.isLeft) {
    const count = i - found.index + 1;
    ctx.operands.splice(found.index, count, elem);
    ctx.ops.splice(i, 1);
  } else {
    const count = found.index - i + 1;
    ctx.operands.splice(i, count, elem);
    ctx.ops.splice(i, 1);
  }
  return true;
}

function getArrayTargetFromPointer(
  ctx: ProcessOperatorsCtx,
  ptrObj: unknown,
  kind: "index" | "field"
) {
  const ptrName = getProp(ptrObj, "ptrName");
  if (typeof ptrName !== "string") throw new Error("invalid pointer target");
  const { targetVal } = ctx.getBindingTargetFn(ptrName);
  if (!isArrayInstance(targetVal)) {
    if (kind === "index") throw new Error("cannot index non-array value");
    throw new Error("cannot access field on non-array value");
  }
  return targetVal;
}

function handleArrayLikeFieldAccess(
  ctx: ProcessOperatorsCtx,
  arrLike: unknown,
  fieldName: string,
  i: number
): boolean {
  if (!isArrayInstance(arrLike)) return false;
  if (fieldName === "length" || fieldName === "len") {
    replaceWithBigIntNumber(ctx, arrLike.length, i);
    return true;
  }
  if (fieldName === "init") {
    replaceWithBigIntNumber(ctx, arrLike.initializedCount, i);
    return true;
  }
  return false;
}

function resolveMethodWrapper(
  ctx: ProcessOperatorsCtx,
  fieldName: string,
  receiver: unknown
) {
  const binding = envGet(ctx.localEnv, fieldName);
  if (binding !== undefined && isFnWrapper(binding))
    return makeBoundWrapperFromOrigFn(binding.fn, receiver);
  return undefined;
}

function handleCallAt(ctx: ProcessOperatorsCtx, i: number): boolean {
  const funcOperand = ctx.operands[i];
  const callAppOperand = ctx.operands[i + 1];

  const maybeNextOp = ctx.ops[i + 1];
  if (typeof maybeNextOp === "string" && maybeNextOp.startsWith(".")) {
    const result = ctx.evaluateCallAtFn(funcOperand, callAppOperand);
    const fieldName = maybeNextOp.substring(1);
    if (!result) throwCannotAccessFieldMissing();
    const fieldValue = getFieldValueFromInstance(result, fieldName);
    ctx.operands.splice(i, 3, fieldValue);
    ctx.ops.splice(i, 2);
    return true;
  }

  const result = ctx.evaluateCallAtFn(funcOperand, callAppOperand);
  ctx.operands.splice(i, 2, result);
  ctx.ops.splice(i, 1);
  return true;
}

function handleIndexAt(ctx: ProcessOperatorsCtx, i: number): boolean {
  const indexOpnd = ctx.operands[i + 1];
  const arrOperand = ctx.operands[i];

  let idxVal: number;
  if (
    isPlainObject(indexOpnd) &&
    getProp(indexOpnd, "indexExpr") !== undefined
  ) {
    const idxExprProp = getProp(indexOpnd, "indexExpr");
    if (typeof idxExprProp !== "string")
      throw new Error("invalid index expression");
    idxVal = convertOperandToNumber(
      ctx.evaluateReturningOperandFn(String(idxExprProp), ctx.localEnv)
    );
  } else {
    idxVal = convertOperandToNumber(indexOpnd);
  }

  if (!arrOperand) {
    if (tryResolveMissingIndex(ctx, i, idxVal)) return true;
    throw new Error("cannot index missing value");
  }

  if (
    isPlainObject(arrOperand) &&
    isPointer(arrOperand) &&
    getProp(arrOperand, "ptrIsSlice") === true
  ) {
    const targetVal = getArrayTargetFromPointer(ctx, arrOperand, "index");
    const elem = getArrayElementFromInstance(targetVal, idxVal);
    ctx.operands.splice(i, 2, elem);
    ctx.ops.splice(i, 1);
    return true;
  }

  if (isArrayInstance(arrOperand)) {
    const elem = getArrayElementFromInstance(arrOperand, idxVal);
    ctx.operands.splice(i, 2, elem);
    ctx.ops.splice(i, 1);
    return true;
  }
  throw new Error("cannot index non-array value");
}

function handleDotOnMissing(
  ctx: ProcessOperatorsCtx,
  i: number,
  fieldName: string
): boolean {
  const found = findNearbyOperandIndex(
    ctx.operands,
    i,
    (maybe) => isStructInstance(maybe) || isThisBinding(maybe)
  );
  if (!found) return false;

  const maybe = ctx.operands[found.index];
  const fieldValue = getFieldValueFromInstance(maybe, fieldName);
  if (found.isLeft) {
    const count = i - found.index + 1;
    ctx.operands.splice(found.index, count, fieldValue);
    ctx.ops.splice(i, 1);
    return true;
  }

  const count = found.index - i + 1;
  ctx.operands.splice(i, count, fieldValue);
  ctx.ops.splice(i, 1);
  return true;
}

function handleDotOnArrayLike(
  ctx: ProcessOperatorsCtx,
  i: number,
  fieldName: string,
  receiver: unknown
): boolean {
  let arrLike: unknown | undefined = undefined;
  if (
    isPlainObject(receiver) &&
    isPointer(receiver) &&
    getProp(receiver, "ptrIsSlice") === true
  ) {
    arrLike = getArrayTargetFromPointer(ctx, receiver, "field");
  } else if (isArrayInstance(receiver)) {
    arrLike = receiver;
  }
  if (arrLike === undefined) return false;

  if (handleArrayLikeFieldAccess(ctx, arrLike, fieldName, i)) return true;
  throw new Error(`invalid field access: ${fieldName}`);
}

function handleStructOrThisField(
  ctx: ProcessOperatorsCtx,
  i: number,
  fieldName: string,
  receiver: unknown
): boolean {
  if (!isPlainObject(receiver)) throwCannotAccessField();
  const fv = getProp(receiver, "fieldValues");
  if (fv === undefined || !Object.prototype.hasOwnProperty.call(fv, fieldName))
    return false;
  const fieldValue = getFieldValueFromInstance(receiver, fieldName);
  ctx.operands.splice(i, 2, fieldValue);
  ctx.ops.splice(i, 1);
  return true;
}

function tryInvokeMethodWrapper(
  ctx: ProcessOperatorsCtx,
  i: number,
  wrapper: unknown
): boolean {
  const nextOpnd = ctx.operands[i + 1];
  if (isPlainObject(nextOpnd) && hasCallApp(nextOpnd)) {
    const callResult = ctx.evaluateCallAtFn(wrapper, nextOpnd);
    ctx.operands.splice(i, 2, callResult);
    ctx.ops.splice(i, 1);
    return true;
  }

  if (ctx.ops[i + 1] === "call") {
    const callAppOperand = ctx.operands[i + 2];
    const callResult = ctx.evaluateCallAtFn(wrapper, callAppOperand);
    ctx.operands.splice(i, 3, callResult);
    ctx.ops.splice(i, 2);
    return true;
  }

  return false;
}

function markWrapperAutoCall(wrapper: unknown) {
  if (!isPlainObject(wrapper)) return;
  const fnObj = getProp(wrapper, "fn");
  if (isPlainObject(fnObj)) Reflect.set(fnObj, "__autoCall", true);
}

function handleDotOnStructOrThis(
  ctx: ProcessOperatorsCtx,
  i: number,
  fieldName: string,
  receiver: unknown
): boolean {
  if (!(isStructInstance(receiver) || isThisBinding(receiver))) return false;
  if (handleStructOrThisField(ctx, i, fieldName, receiver)) return true;

  const wrapper = resolveMethodWrapper(ctx, fieldName, receiver);
  if (!wrapper) throw new Error(`invalid field access: ${fieldName}`);
  if (tryInvokeMethodWrapper(ctx, i, wrapper)) return true;

  markWrapperAutoCall(wrapper);
  ctx.operands.splice(i, 2, wrapper);
  ctx.ops.splice(i, 1);
  return true;
}

function handlePrimitiveFieldAccess(
  ctx: ProcessOperatorsCtx,
  i: number,
  fieldName: string,
  receiver: unknown
): boolean {
  const wrapper = resolveMethodWrapper(ctx, fieldName, receiver);
  if (!wrapper) return false;
  ctx.operands.splice(i, 2, wrapper);
  ctx.ops.splice(i, 1);
  return true;
}

function handleDotAt(ctx: ProcessOperatorsCtx, i: number): boolean {
  const fieldName = ctx.ops[i].substring(1);
  const receiver = ctx.operands[i];

  if (!isStructInstance(receiver) && !isThisBinding(receiver)) {
    if (handleDotOnMissing(ctx, i, fieldName)) return true;
  }

  if (handleDotOnArrayLike(ctx, i, fieldName, receiver)) return true;
  if (handleDotOnStructOrThis(ctx, i, fieldName, receiver)) return true;
  if (handlePrimitiveFieldAccess(ctx, i, fieldName, receiver)) return true;

  if (!receiver) throwCannotAccessFieldMissing();
  throwCannotAccessField();
}

function tryAutoInvokeFirstWrapper(ctx: ProcessOperatorsCtx) {
  if (!isFnWrapper(ctx.operands[0])) return;
  const firstOp = ctx.operands[0];
  const fnObj = getProp(firstOp, "fn");
  const maybeAuto = getProp(fnObj, "__autoCall");
  if (maybeAuto !== true) return;
  const res = ctx.evaluateCallAtFn(ctx.operands[0], { callApp: [] });
  ctx.operands.splice(0, 1, res);
}

export function processOperators(
  operands: unknown[],
  ops: string[],
  localEnv: Env,
  evaluateReturningOperandFn: (expr: string, env: Env) => unknown,
  evaluateCallAtFn: (funcOperand: unknown, callAppOperand: unknown) => unknown,
  getBindingTargetFn: (name: string) => BindingTarget
) {
  const ctx: ProcessOperatorsCtx = {
    operands,
    ops,
    localEnv,
    evaluateReturningOperandFn,
    evaluateCallAtFn,
    getBindingTargetFn,
  };

  let i = 0;
  while (i < ctx.ops.length) {
    const op = ctx.ops[i];

    if (op === "call") {
      if (handleCallAt(ctx, i)) continue;
    }

    if (op === "index") {
      if (handleIndexAt(ctx, i)) continue;
    }

    if (op && op.startsWith(".")) {
      if (handleDotAt(ctx, i)) continue;
    }

    // Not a high-precedence operator; leave it for precedence handling later.
    i++;
  }

  // Auto-invoke zero-arg call when we created a bound-wrapper but parsing
  // didn't consume the call.
  tryAutoInvokeFirstWrapper(ctx);
}
