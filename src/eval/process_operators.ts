import { Env, envGet } from "../env";
import {
  getFieldValueFromInstance,
  getArrayElementFromInstance,
  throwCannotAccessField,
  throwCannotAccessFieldMissing,
  throwInvalidFieldAccess,
} from "./pure_helpers";
import {
  findOperandMatching,
  applyOperandReplacement,
  replaceOperandRange,
} from "./operand_resolution";
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
  RuntimeValue,
  IntOperand,
} from "../types";
import { convertOperandToNumber } from "../interpret_helpers";

interface BindingTarget {
  binding: RuntimeValue;
  targetVal: RuntimeValue;
}

interface FieldAccess {
  arrLike: RuntimeValue;
  fieldName: string;
}

interface MethodAccess {
  fieldName: string;
  receiver: RuntimeValue;
}

interface ProcessOperatorsContext {
  localEnv: Env;
  evaluateReturningOperandFn: (expr: string, env: Env) => RuntimeValue;
  evaluateCallAtFn: (
    funcOperand: RuntimeValue,
    callAppOperand: RuntimeValue
  ) => RuntimeValue;
  getBindingTargetFn: (name: string) => BindingTarget;
}

interface ProcessOperatorsCtxExtra {
  operands: RuntimeValue[];
  ops: string[];
}

type ProcessOperatorsCtx = ProcessOperatorsContext & ProcessOperatorsCtxExtra;

// eslint-disable-next-line max-params
function replaceOperands(
  ctx: ProcessOperatorsCtx,
  startIdx: number,
  deleteCount: number,
  newOperand: RuntimeValue
) {
  replaceOperandRange({
    operands: ctx.operands,
    ops: ctx.ops,
    startIdx,
    count: deleteCount,
    replacement: newOperand,
  });
}

function replaceWithBigIntNumber(
  ctx: ProcessOperatorsCtx,
  n: number,
  i: number
) {
  const val: IntOperand = { type: "int-operand", valueBig: BigInt(n) };
  replaceOperands(ctx, i, 2, val);
}

interface FoundReplacementArgs {
  ctx: ProcessOperatorsCtx;
  index: number;
  result: { foundIndex: number; isLeft: boolean };
  operand: RuntimeValue;
}

// Common helper for resolving and replacing operands based on search result
function applyFoundOperandReplacement(args: FoundReplacementArgs): void {
  const { ctx, index, result, operand } = args;
  applyOperandReplacement({
    ctx: { operands: ctx.operands, ops: ctx.ops, currentIndex: index },
    sourceIdx: index,
    targetIdx: result.foundIndex,
    operand,
    isLeftSide: result.isLeft,
  });
}

function tryResolveMissingIndex(
  ctx: ProcessOperatorsCtx,
  i: number,
  idxVal: number
): boolean {
  const result = findOperandMatching(
    { operands: ctx.operands, ops: ctx.ops, currentIndex: i },
    (maybe) => isArrayInstance(maybe) || isThisBinding(maybe)
  );
  if (!result) return false;

  const elem = getArrayElementFromInstance(result.operand, idxVal);
  applyFoundOperandReplacement({ ctx, index: i, result, operand: elem });
  return true;
}

function getArrayTargetFromPointer(
  ctx: ProcessOperatorsCtx,
  ptrObj: RuntimeValue,
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
  i: number,
  fieldAccess: FieldAccess
): boolean {
  if (!isArrayInstance(fieldAccess.arrLike)) return false;
  if (fieldAccess.fieldName === "length" || fieldAccess.fieldName === "len") {
    replaceWithBigIntNumber(ctx, fieldAccess.arrLike.length, i);
    return true;
  }
  if (fieldAccess.fieldName === "init") {
    replaceWithBigIntNumber(ctx, fieldAccess.arrLike.initializedCount, i);
    return true;
  }
  return false;
}

function resolveMethodWrapper(ctx: ProcessOperatorsCtx, method: MethodAccess) {
  const binding = envGet(ctx.localEnv, method.fieldName);
  if (binding !== undefined && isFnWrapper(binding))
    return makeBoundWrapperFromOrigFn(binding.fn, method.receiver);
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
    replaceOperands(ctx, i, 2, elem);
    return true;
  }

  if (isArrayInstance(arrOperand)) {
    const elem = getArrayElementFromInstance(arrOperand, idxVal);
    replaceOperands(ctx, i, 2, elem);
    return true;
  }
  throw new Error("cannot index non-array value");
}

function handleDotOnMissing(
  ctx: ProcessOperatorsCtx,
  i: number,
  fieldName: string
): boolean {
  const result = findOperandMatching(
    { operands: ctx.operands, ops: ctx.ops, currentIndex: i },
    (maybe) => isStructInstance(maybe) || isThisBinding(maybe)
  );
  if (!result) return false;

  const fieldValue = getFieldValueFromInstance(result.operand, fieldName);
  applyFoundOperandReplacement({ ctx, index: i, result, operand: fieldValue });
  return true;
}

function handleDotOnArrayLike(
  ctx: ProcessOperatorsCtx,
  i: number,
  fieldAccess: MethodAccess
): boolean {
  let arrLike: RuntimeValue | undefined = undefined;
  if (
    isPlainObject(fieldAccess.receiver) &&
    isPointer(fieldAccess.receiver) &&
    getProp(fieldAccess.receiver, "ptrIsSlice") === true
  ) {
    arrLike = getArrayTargetFromPointer(ctx, fieldAccess.receiver, "field");
  } else if (isArrayInstance(fieldAccess.receiver)) {
    arrLike = fieldAccess.receiver;
  }
  if (arrLike === undefined) return false;

  if (
    handleArrayLikeFieldAccess(ctx, i, {
      arrLike,
      fieldName: fieldAccess.fieldName,
    })
  )
    return true;
  throwInvalidFieldAccess(fieldAccess.fieldName);
  return false; // Unreachable, but satisfies type checker
}

function handleStructOrThisField(
  ctx: ProcessOperatorsCtx,
  i: number,
  fieldAccess: MethodAccess
): boolean {
  if (!isPlainObject(fieldAccess.receiver)) throwCannotAccessField();
  const fv = getProp(fieldAccess.receiver, "fieldValues");
  // Check if fv is a Map and has the field
  if (fv === undefined) return false;
  if (fv instanceof Map && !fv.has(fieldAccess.fieldName)) return false;
  if (
    !(fv instanceof Map) &&
    !Object.prototype.hasOwnProperty.call(fv, fieldAccess.fieldName)
  )
    return false;

  const fieldValue = getFieldValueFromInstance(
    fieldAccess.receiver,
    fieldAccess.fieldName
  );
  replaceOperands(ctx, i, 2, fieldValue);
  return true;
}

function tryInvokeMethodWrapper(
  ctx: ProcessOperatorsCtx,
  i: number,
  wrapper: RuntimeValue
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

function markWrapperAutoCall(wrapper: RuntimeValue) {
  if (!isPlainObject(wrapper)) return;
  const fnObj = getProp(wrapper, "fn");
  if (isPlainObject(fnObj)) Reflect.set(fnObj, "__autoCall", true);
}

function handleDotOnStructOrThis(
  ctx: ProcessOperatorsCtx,
  i: number,
  fieldAccess: MethodAccess
): boolean {
  if (
    !(
      isStructInstance(fieldAccess.receiver) ||
      isThisBinding(fieldAccess.receiver)
    )
  )
    return false;
  if (handleStructOrThisField(ctx, i, fieldAccess)) return true;

  const wrapper = resolveMethodWrapper(ctx, {
    fieldName: fieldAccess.fieldName,
    receiver: fieldAccess.receiver,
  });
  if (!wrapper) throwInvalidFieldAccess(fieldAccess.fieldName);
  if (tryInvokeMethodWrapper(ctx, i, wrapper)) return true;

  markWrapperAutoCall(wrapper);
  replaceOperands(ctx, i, 2, wrapper);
  return true;
}

function handlePrimitiveFieldAccess(
  ctx: ProcessOperatorsCtx,
  i: number,
  fieldAccess: MethodAccess
): boolean {
  const wrapper = resolveMethodWrapper(ctx, {
    fieldName: fieldAccess.fieldName,
    receiver: fieldAccess.receiver,
  });
  if (!wrapper) return false;
  replaceOperands(ctx, i, 2, wrapper);
  return true;
}

function handleDotAt(ctx: ProcessOperatorsCtx, i: number): boolean {
  const fieldName = ctx.ops[i].substring(1);
  const receiver = ctx.operands[i];

  if (!isStructInstance(receiver) && !isThisBinding(receiver)) {
    if (handleDotOnMissing(ctx, i, fieldName)) return true;
  }

  const fieldAccess = { fieldName, receiver };
  if (handleDotOnArrayLike(ctx, i, fieldAccess)) return true;
  if (handleDotOnStructOrThis(ctx, i, fieldAccess)) return true;
  if (handlePrimitiveFieldAccess(ctx, i, fieldAccess)) return true;

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
  operands: RuntimeValue[],
  ops: string[],
  context: ProcessOperatorsContext
) {
  const ctx: ProcessOperatorsCtx = {
    operands,
    ops,
    ...context,
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
