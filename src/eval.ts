import { convertOperandToNumber } from "./interpret_helpers";
import { applyBinaryOp } from "./eval/operators";
import {
  handleIfExpression,
  handleMatchExpression,
  handleFnExpression,
} from "./eval/control_flow";
import {
  mustGetEnvBinding,
  makeBoundWrapperFromOrigFn,
  setEvaluateReturningOperand,
} from "./eval/functions";
import {
  tokenizeExpression,
  splitTokensToOperandsAndOps,
} from "./eval/tokenizer";
import {
  getFieldValueFromInstance,
  getArrayElementFromInstance,
  throwCannotAccessField,
  throwCannotAccessFieldMissing,
} from "./eval/pure_helpers";
import {
  resolveAddressOf,
  resolveDereference,
  resolveStructInstantiation,
  resolveArrayLiteral,
  resolveGroupedExpr,
  resolveIdentifier,
  isNotResolved,
  type OperandResolutionContext,
} from "./eval/operand_resolvers";
import {
  evaluateCall,
  type CallEvaluationContext,
} from "./eval/call_evaluator";

import {
  isPlainObject,
  isBoolOperand,
  isFloatOperand,
  isIntOperand,
  isStructInstance,
  isThisBinding,
  isPointer,
  unwrapBindingValue,
  isFnWrapper,
  hasCallArgs,
  hasCallApp,
  hasUninitialized,
  getProp,
  isArrayInstance,
  throwUseOfUninitialized,
} from "./types";

// Re-export from operators module for backward compatibility
export { isTruthy, applyBinaryOp } from "./eval/operators";

import { Env, envGet } from "./env";

function processOperators(
  operands: unknown[],
  ops: string[],
  localEnv: Env,
  evaluateReturningOperandFn: (expr: string, env: Env) => unknown,
  evaluateCallAtFn: (funcOperand: unknown, callAppOperand: unknown) => unknown,
  getBindingTargetFn: (name: string) => { binding: unknown; targetVal: unknown }
) {
  // helper to replace an array length/init field with a numeric operand
  function replaceWithBigIntNumber(
    n: number,
    i: number,
    operands: unknown[],
    ops: string[]
  ) {
    const val = { valueBig: BigInt(n) };
    operands.splice(i, 2, val);
    ops.splice(i, 1);
  }

  // helper to find a nearby non-undefined operand either to the left or
  // to the right of the current index `i` that satisfies the provided
  // predicate. Returns an object with the found index and a boolean `isLeft`.
  function findNearbyOperandIndex(
    operands: unknown[],
    i: number,
    predicate: (v: unknown) => boolean
  ): { index: number; isLeft: boolean } | undefined {
    // search left
    for (let j = i - 1; j >= 0; j--) {
      if (operands[j] !== undefined) {
        if (predicate(operands[j])) return { index: j, isLeft: true };
        break;
      }
    }
    // search right
    for (let j = i + 1; j < operands.length; j++) {
      if (operands[j] !== undefined) {
        if (predicate(operands[j])) return { index: j, isLeft: false };
        break;
      }
    }
    return undefined;
  }

  function tryResolveMissingIndex(
    i: number,
    idxVal: number,
    operands: unknown[],
    ops: string[]
  ) {
    const found = findNearbyOperandIndex(
      operands,
      i,
      (maybe) => isArrayInstance(maybe) || isThisBinding(maybe)
    );
    if (!found) return false;
    const maybe = operands[found.index];
    const elem = getArrayElementFromInstance(maybe, idxVal);
    if (found.isLeft) {
      const count = i - found.index + 1;
      operands.splice(found.index, count, elem);
      ops.splice(i, 1);
    } else {
      const count = found.index - i + 1;
      operands.splice(i, count, elem);
      ops.splice(i, 1);
    }
    return true;
  }

  function getArrayTargetFromPointer(ptrObj: unknown, kind: "index" | "field") {
    const ptrName = getProp(ptrObj, "ptrName");
    if (typeof ptrName !== "string") throw new Error("invalid pointer target");
    const { targetVal } = getBindingTargetFn(ptrName);
    if (!isArrayInstance(targetVal)) {
      if (kind === "index") throw new Error("cannot index non-array value");
      throw new Error("cannot access field on non-array value");
    }
    return targetVal;
  }

  function handleArrayLikeFieldAccess(
    arrLike: unknown,
    fieldName: string,
    i: number,
    operands: unknown[],
    ops: string[]
  ) {
    if (!isArrayInstance(arrLike)) return false;
    if (fieldName === "length" || fieldName === "len") {
      replaceWithBigIntNumber(arrLike.length, i, operands, ops);
      return true;
    }
    if (fieldName === "init") {
      replaceWithBigIntNumber(arrLike.initializedCount, i, operands, ops);
      return true;
    }
    return false;
  }

  function resolveMethodWrapper(fieldName: string, receiver: unknown) {
    const binding = envGet(localEnv, fieldName);
    if (binding !== undefined && isFnWrapper(binding))
      return makeBoundWrapperFromOrigFn(binding.fn, receiver);
    return undefined;
  }

  // Extracted small handlers to keep top-level complexity low.
  function handleCallAt(i: number) {
    const funcOperand = operands[i];
    const callAppOperand = operands[i + 1];

    if (
      ops[i + 1] &&
      typeof ops[i + 1] === "string" &&
      ops[i + 1].startsWith(".")
    ) {
      const result = evaluateCallAtFn(funcOperand, callAppOperand);
      const nextOp = ops[i + 1];
      if (typeof nextOp !== "string")
        throw new Error("invalid field access operator");
      const fieldName = nextOp.substring(1);
      if (!result) throwCannotAccessFieldMissing();
      const fieldValue = getFieldValueFromInstance(result, fieldName);

      operands.splice(i, 3, fieldValue);
      ops.splice(i, 2);
      return true;
    }

    const result = evaluateCallAtFn(funcOperand, callAppOperand);
    operands.splice(i, 2, result);
    ops.splice(i, 1);
    return true;
  }

  function handleIndexAt(i: number) {
    const indexOpnd = operands[i + 1];
    const arrOperand = operands[i];

    let idxVal: number;
    if (
      isPlainObject(indexOpnd) &&
      getProp(indexOpnd, "indexExpr") !== undefined
    ) {
      const idxExprProp = getProp(indexOpnd, "indexExpr");
      if (typeof idxExprProp !== "string")
        throw new Error("invalid index expression");
      idxVal = convertOperandToNumber(
        evaluateReturningOperandFn(String(idxExprProp), localEnv)
      );
    } else {
      idxVal = convertOperandToNumber(indexOpnd);
    }

    if (!arrOperand) {
      if (tryResolveMissingIndex(i, idxVal, operands, ops)) return true;
      throw new Error("cannot index missing value");
    }

    if (
      isPlainObject(arrOperand) &&
      isPointer(arrOperand) &&
      getProp(arrOperand, "ptrIsSlice") === true
    ) {
      const targetVal = getArrayTargetFromPointer(arrOperand, "index");
      const elem = getArrayElementFromInstance(targetVal, idxVal);
      operands.splice(i, 2, elem);
      ops.splice(i, 1);
      return true;
    }

    if (isArrayInstance(arrOperand)) {
      const elem = getArrayElementFromInstance(arrOperand, idxVal);
      operands.splice(i, 2, elem);
      ops.splice(i, 1);
      return true;
    }
    throw new Error("cannot index non-array value");
  }

  function handleDotAt(i: number) {
    const fieldName = ops[i].substring(1);
    const structInstance = operands[i];

    if (!structInstance) {
      const found = findNearbyOperandIndex(
        operands,
        i,
        (maybe) => isStructInstance(maybe) || isThisBinding(maybe)
      );
      if (!found) throwCannotAccessFieldMissing();

      const maybe = operands[found.index];
      const fieldValue = getFieldValueFromInstance(maybe, fieldName);
      if (found.isLeft) {
        const count = i - found.index + 1;
        operands.splice(found.index, count, fieldValue);
        ops.splice(i, 1);
        return true;
      }

      const count = found.index - i + 1;
      operands.splice(i, count, fieldValue);
      ops.splice(i, 1);
      return true;
    }

    let arrLike: unknown | undefined = undefined;
    if (
      isPlainObject(structInstance) &&
      isPointer(structInstance) &&
      getProp(structInstance, "ptrIsSlice") === true
    ) {
      arrLike = getArrayTargetFromPointer(structInstance, "field");
    } else if (isArrayInstance(structInstance)) {
      arrLike = structInstance;
    }

    if (arrLike !== undefined) {
      if (handleArrayLikeFieldAccess(arrLike, fieldName, i, operands, ops))
        return true;
      throw new Error(`invalid field access: ${fieldName}`);
    }

    function handleStructOrThisField(
      i: number,
      fieldName: string,
      structInstance: unknown
    ) {
      if (!isPlainObject(structInstance)) throwCannotAccessField();

      const fv = getProp(structInstance, "fieldValues");
      if (
        fv !== undefined &&
        Object.prototype.hasOwnProperty.call(fv, fieldName)
      ) {
        const fieldValue = getFieldValueFromInstance(structInstance, fieldName);
        operands.splice(i, 2, fieldValue);
        ops.splice(i, 1);
        return true;
      }

      const wrapper = resolveMethodWrapper(fieldName, structInstance);
      if (!wrapper) throw new Error(`invalid field access: ${fieldName}`);

      const nextOpnd = operands[i + 1];
      if (isPlainObject(nextOpnd) && hasCallApp(nextOpnd)) {
        const callResult = evaluateCallAtFn(wrapper, nextOpnd);
        operands.splice(i, 2, callResult);
        ops.splice(i, 1);
        return true;
      }

      if (ops[i + 1] === "call") {
        const callAppOperand = operands[i + 2];
        const callResult = evaluateCallAtFn(wrapper, callAppOperand);
        operands.splice(i, 3, callResult);
        ops.splice(i, 2);
        return true;
      }

      if (isPlainObject(wrapper)) {
        const fnObj = getProp(wrapper, "fn");
        if (isPlainObject(fnObj)) Reflect.set(fnObj, "__autoCall", true);
      }

      operands.splice(i, 2, wrapper);
      ops.splice(i, 1);
      return true;
    }

    if (isStructInstance(structInstance) || isThisBinding(structInstance)) {
      if (handleStructOrThisField(i, fieldName, structInstance)) return true;
    }

    if (
      typeof structInstance === "number" ||
      typeof structInstance === "string" ||
      typeof structInstance === "boolean" ||
      isIntOperand(structInstance) ||
      isFloatOperand(structInstance) ||
      isBoolOperand(structInstance)
    ) {
      const wrapper = resolveMethodWrapper(fieldName, structInstance);
      if (!wrapper) throwCannotAccessField();
      operands.splice(i, 2, wrapper);
      ops.splice(i, 1);
      return true;
    }

    throwCannotAccessField();
  }

  let i = 0;
  while (i < ops.length) {
    const op = ops[i];

    if (op === "call") {
      if (handleCallAt(i)) continue;
    }

    if (op === "index") {
      if (handleIndexAt(i)) continue;
    }

    if (op && op.startsWith(".")) {
      if (handleDotAt(i)) continue;
    }

    // Not a high-precedence operator; leave it for precedence handling later.
    i++;
  }

  // If we created a bound-wrapper for a struct method but the call was not
  // consumed (parsing quirks), auto-invoke zero-arg call in that specific
  // case to preserve expected `point.manhattan()` semantics.
  if (isFnWrapper(operands[0])) {
    const firstOp = operands[0];
    const fnObj = getProp(firstOp, "fn");
    const maybeAuto = getProp(fnObj, "__autoCall");
    if (maybeAuto === true) {
      const res = evaluateCallAtFn(operands[0], { callApp: [] });
      operands.splice(0, 1, res);
    }
  }
}

export function evaluateReturningOperand(
  exprStr: string,
  localEnv: Env
): unknown {
  // Support an 'if' expression: if (condition) trueBranch else falseBranch
  const sTrim = exprStr.trimStart();
  if (/^if\b/.test(sTrim)) {
    return handleIfExpression(sTrim, localEnv, evaluateReturningOperand);
  }

  // Support a 'match' expression: match (<expr>) { case <pat> => <expr>; ... default => <expr>; }
  if (/^match\b/.test(sTrim)) {
    return handleMatchExpression(sTrim, localEnv, evaluateReturningOperand);
  }

  // Support an inline function expression: fn name(...) => ... or fn name(...) { ... }
  // Use a stricter check to ensure we have a proper fn header (name followed by '(')
  if (/^fn\s+[a-zA-Z_]\w*\s*\(/.test(sTrim)) {
    return handleFnExpression(sTrim, localEnv);
  }

  const exprTokens = tokenizeExpression(exprStr);
  const { operands: initialOperands, ops } =
    splitTokensToOperandsAndOps(exprTokens);
  let operands = initialOperands;

  // helper to get binding and deref target
  function getBindingTarget(name: string) {
    const binding = mustGetEnvBinding(localEnv, name);
    if (
      isPlainObject(binding) &&
      hasUninitialized(binding) &&
      binding.uninitialized
    )
      throwUseOfUninitialized(name);
    const targetVal = unwrapBindingValue(binding);
    return { binding, targetVal };
  }

  // Create resolution context for operand resolver functions
  const resolutionCtx: OperandResolutionContext = {
    localEnv,
    getBindingTarget,
    evaluateExpr: evaluateReturningOperand,
  };

  // Create call evaluation context - must be defined before operands.map()
  // since evaluateCallAt may be called during operand resolution
  const callCtx: CallEvaluationContext = {
    localEnv,
    evaluateExpr: evaluateReturningOperand,
  };

  // helper to evaluate a call and return its result (delegates to extracted module)
  function evaluateCallAt(funcOperand: unknown, callAppOperand: unknown) {
    return evaluateCall(funcOperand, callAppOperand, callCtx);
  }

  // resolve identifiers, address-of (&) and dereference (*) from localEnv
  operands = operands.map((op) => {
    // parenthesized grouped expression handling
    const groupedResult = resolveGroupedExpr(op, resolutionCtx);
    if (groupedResult !== undefined) return groupedResult;

    // array literal handling (parse-time placeholder -> runtime instance)
    const arrayResult = resolveArrayLiteral(op, resolutionCtx);
    if (arrayResult !== undefined) return arrayResult;

    // address-of: produce a pointer object
    const addrOfResult = resolveAddressOf(op, resolutionCtx);
    if (addrOfResult !== undefined) return addrOfResult;

    // dereference: fetch the value pointed to by a pointer
    const derefResult = resolveDereference(op, resolutionCtx);
    if (derefResult !== undefined) return derefResult;

    // struct instantiation handling
    const structResult = resolveStructInstantiation(op, resolutionCtx);
    if (structResult !== undefined) return structResult;

    // function call handling (identifier with callArgs)
    if (isPlainObject(op) && hasCallArgs(op)) {
      const callArgsRaw = op.callArgs;
      // Reuse the shared call evaluator to keep behavior consistent with the
      // explicit "call" operator path and avoid duplicated argument/env logic.
      return evaluateCallAt(op, { callApp: callArgsRaw });
    }

    // identifier resolution (delegates to extracted module)
    const identResult = resolveIdentifier(op, resolutionCtx);
    if (!isNotResolved(identResult)) return identResult;

    return op;
  });

  function applyPrecedence(opSet: Set<string>) {
    let i = 0;
    while (i < ops.length) {
      if (opSet.has(ops[i])) {
        const res = applyBinaryOp(ops[i], operands[i], operands[i + 1]);
        operands.splice(i, 2, res);
        ops.splice(i, 1);
      } else i++;
    }
  }

  // Process high-precedence operators (calls, indexing, field access)
  processOperators(
    operands,
    ops,
    localEnv,
    evaluateReturningOperand,
    evaluateCallAt,
    getBindingTarget
  );

  applyPrecedence(new Set(["*", "/", "%"]));
  applyPrecedence(new Set(["+", "-"]));
  // comparison operators
  applyPrecedence(new Set(["<", ">", "<=", ">=", "==", "!="]));
  applyPrecedence(new Set(["&&"]));
  applyPrecedence(new Set(["||"]));

  // Debug: show final operand for suspicious expressions
  // final result is operands[0]
  return operands[0];
}

export function evaluateFlatExpression(exprStr: string, env: Env): number {
  const opnd = evaluateReturningOperand(exprStr, env);
  if (isBoolOperand(opnd)) return opnd.boolValue ? 1 : 0;
  if (isIntOperand(opnd)) return Number(opnd.valueBig);
  if (typeof opnd === "number") return opnd;
  if (isFloatOperand(opnd)) return opnd.floatValue;
  if (opnd === undefined) return 0;
  // Debug: output unexpected operand
  throw new Error("cannot evaluate expression");
}

// Initialize the functions module with evaluateReturningOperand to break circular dependency
setEvaluateReturningOperand(evaluateReturningOperand);
