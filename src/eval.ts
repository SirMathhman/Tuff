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

  // helper to replace an array length/init field with a numeric operand
  function replaceWithBigIntNumber(n: number) {
    const val = { valueBig: BigInt(n) };
    operands.splice(i, 2, val);
    ops.splice(i, 1);
  }

  // helper to find a nearby non-undefined operand either to the left or
  // to the right of the current index `i` that satisfies the provided
  // predicate. Returns an object with the found index and a boolean `isLeft`.
  function findNearbyOperandIndex(
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

  // helper to resolve an index operation when the left operand is missing by
  // searching left or right for a nearby array/this operand. Returns true if
  // the index was resolved and splices the operands/ops appropriately.
  function tryResolveMissingIndex(idxVal: number) {
    const found = findNearbyOperandIndex(
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

  // Debug: show tokenization for suspicious patterns

  // Handle function application and field access (highest precedence, left-to-right)
  let i = 0;
  while (i < ops.length) {
    // Debug: trace token processing for suspicious expressions
    if (ops[i] === "call") {
      // If a field access immediately follows a call (call + .field), handle both
      // together to avoid operand alignment issues.
      if (
        ops[i + 1] &&
        typeof ops[i + 1] === "string" &&
        ops[i + 1].startsWith(".")
      ) {
        const funcOperand = operands[i];
        const callAppOperand = operands[i + 1];
        const result = evaluateCallAt(funcOperand, callAppOperand);
        const nextOp = ops[i + 1];
        if (typeof nextOp !== "string")
          throw new Error("invalid field access operator");
        const fieldName = nextOp.substring(1);
        if (!result) throwCannotAccessFieldMissing();
        const fieldValue = getFieldValueFromInstance(result, fieldName);

        // Remove [funcOperand, callApp, undefined] -> replace with the fieldValue
        operands.splice(i, 3, fieldValue);
        // remove the 'call' and '.field' operators
        ops.splice(i, 2);
        // continue at same index
      } else {
        const funcOperand = operands[i];
        const callAppOperand = operands[i + 1];
        const result = evaluateCallAt(funcOperand, callAppOperand);

        operands.splice(i, 2, result);
        ops.splice(i, 1);
      }
    } else if (ops[i] === "index") {
      // index operator
      const indexOpnd = operands[i + 1];
      const arrOperand = operands[i];

      // Evaluate index expression
      let idxVal: number;
      if (isPlainObject(indexOpnd) && "indexExpr" in indexOpnd) {
        if (typeof indexOpnd.indexExpr !== "string")
          throw new Error("invalid index expression");
        idxVal = convertOperandToNumber(
          evaluateReturningOperand(indexOpnd.indexExpr, localEnv)
        );
      } else {
        // index was parsed as an operand; evaluate it normally
        idxVal = convertOperandToNumber(indexOpnd);
      }

      if (!arrOperand) {
        if (tryResolveMissingIndex(idxVal)) continue;
        throw new Error("cannot index missing value");
      }

      // pointer slice indexing
      if (
        isPlainObject(arrOperand) &&
        isPointer(arrOperand) &&
        getProp(arrOperand, "ptrIsSlice") === true
      ) {
        const targetVal = getArrayTargetFromPointer(arrOperand, "index");
        const elem = getArrayElementFromInstance(targetVal, idxVal);
        operands.splice(i, 2, elem);
        ops.splice(i, 1);
        continue;
      }

      if (isArrayInstance(arrOperand)) {
        const elem = getArrayElementFromInstance(arrOperand, idxVal);
        // Replace [arrOperand, indexExpr] -> elem
        operands.splice(i, 2, elem);
        ops.splice(i, 1);
      } else {
        throw new Error("cannot index non-array value");
      }
    } else if (ops[i] && ops[i].startsWith(".")) {
      // Field access operator
      const fieldName = ops[i].substring(1); // Remove the '.' prefix
      const structInstance = operands[i];

      if (!structInstance) {
        // Attempt to recover: sometimes due to token ordering the actual struct instance
        // may be to the left (e.g., parsing quirks). Search left for a nearby non-undefined
        // operand that looks like a struct/this binding and use that.
        const found = findNearbyOperandIndex(
          (maybe) => isStructInstance(maybe) || isThisBinding(maybe)
        );
        if (found) {
          const maybe = operands[found.index];
          const fieldValue = getFieldValueFromInstance(maybe, fieldName);
          if (found.isLeft) {
            const count = i - found.index + 1;
            operands.splice(found.index, count, fieldValue);
            ops.splice(i, 1);
            continue;
          }

          // found on right
          const count = found.index - i + 1;
          operands.splice(i, count, fieldValue);
          ops.splice(i, 1);
          i = Math.max(0, i);
          continue;
        }
        throwCannotAccessFieldMissing();
      }

      // Handle array-like (.len/.length/.init) for either pointer-to-slice or array instance
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
        if (handleArrayLikeFieldAccess(arrLike, fieldName)) continue;
        throw new Error(`invalid field access: ${fieldName}`);
      }

      // Handle both struct instances and this binding
      if (isStructInstance(structInstance) || isThisBinding(structInstance)) {
        // Debug: show the instance and field being accessed
        // If the instance actually contains the field, return it (covers methods
        // declared on `this` and normal struct fields).
        if (
          isPlainObject(structInstance) &&
          "fieldValues" in structInstance &&
          Object.prototype.hasOwnProperty.call(
            structInstance.fieldValues,
            fieldName
          )
        ) {
          const fieldValue = getFieldValueFromInstance(
            structInstance,
            fieldName
          );
          // Replace the operand and its following placeholder with the field value
          operands.splice(i, 2, fieldValue);
          ops.splice(i, 1);
        } else {
          // If the field isn't present on the instance, attempt to resolve a
          // same-named function from the current environment and bind the
          // instance as `this` (method dispatch for structs).
          const wrapper = resolveMethodWrapper(fieldName, structInstance);
          if (wrapper) {
            // Debug context for method binding
            // If the following operand is a call-application (e.g., `point.method()`
            // where the `()` was parsed into the operand after the dot), invoke
            // the call immediately and replace the range with the result.
            const nextOpnd = operands[i + 1];
            if (isPlainObject(nextOpnd) && hasCallApp(nextOpnd)) {
              const callResult = evaluateCallAt(wrapper, nextOpnd);
              // Replace [structInstance, callApp] -> callResult
              operands.splice(i, 2, callResult);
              // remove the '.' op
              ops.splice(i, 1);
              continue;
            }
            // Also handle the case where the parser produced a separate 'call' op
            // immediately following the '.' operator (ops[i+1] === 'call').
            if (ops[i + 1] === "call") {
              const callAppOperand = operands[i + 2];
              const callResult = evaluateCallAt(wrapper, callAppOperand);
              // Replace [structInstance, placeholder, callApp] -> callResult
              operands.splice(i, 3, callResult);
              // remove both the '.' and 'call' operators
              ops.splice(i, 2);
              continue;
            }

            // Replace the operand and its following placeholder with the wrapped function
            // Mark it so we can auto-invoke if the parser representation didn't
            // preserve the `()` call (see also auto-invoke handling below).
            // NOTE: use a symbolic property name unlikely to collide with user data.
            if (
              isPlainObject(wrapper) &&
              "fn" in wrapper &&
              isPlainObject(wrapper.fn)
            ) {
              // mark function wrapper for possible auto-invocation
              wrapper.fn.__autoCall = true;
            }

            operands.splice(i, 2, wrapper);
            ops.splice(i, 1);
            continue;
          }

          throw new Error(`invalid field access: ${fieldName}`);
        }
      } else if (
        typeof structInstance === "number" ||
        typeof structInstance === "string" ||
        typeof structInstance === "boolean" ||
        isIntOperand(structInstance) ||
        isFloatOperand(structInstance) ||
        isBoolOperand(structInstance)
      ) {
        // Allow method-like calls on primitive receivers by resolving a same-named
        // function in the current localEnv and returning a bound fn wrapper.
        const wrapper = resolveMethodWrapper(fieldName, structInstance);

        if (wrapper) {
          // Replace the operand and its following placeholder with the wrapped function
          operands.splice(i, 2, wrapper);
          ops.splice(i, 1);
          continue;
        }
        // No method found on primitive receiver; reuse shared throw helper
        throwCannotAccessField();
      } else {
        // Non-struct and non-primitive receivers fall through to the same error
        throwCannotAccessField();
      }
    } else {
      i++;
    }
  }

  // If we created a bound-wrapper for a struct method but the call was not
  // consumed (parsing quirks), auto-invoke zero-arg call in that specific
  // case to preserve expected `point.manhattan()` semantics.
  if (isFnWrapper(operands[0])) {
    const maybeAuto = getProp(operands[0].fn, "__autoCall");
    if (maybeAuto === true) {
      const res = evaluateCallAt(operands[0], { callApp: [] });
      operands.splice(0, 1, res);
    }
  }

  // helper to handle length/init fields on array-like instances
  function handleArrayLikeFieldAccess(
    arrLike: unknown,
    fieldName: string
  ): boolean {
    if (!isArrayInstance(arrLike)) return false;
    if (fieldName === "length" || fieldName === "len") {
      replaceWithBigIntNumber(arrLike.length);
      return true;
    }
    if (fieldName === "init") {
      replaceWithBigIntNumber(arrLike.initializedCount);
      return true;
    }
    return false;
  }

  // helper that resolves a method binding and returns a bound wrapper or undefined
  function resolveMethodWrapper(fieldName: string, receiver: unknown) {
    const binding = envGet(localEnv, fieldName);
    if (binding !== undefined && isFnWrapper(binding))
      return makeBoundWrapperFromOrigFn(binding.fn, receiver);
    return undefined;
  }

  // helper to resolve a pointer and ensure it points to an array instance
  function getArrayTargetFromPointer(ptrObj: unknown, kind: "index" | "field") {
    const ptrName = getProp(ptrObj, "ptrName");
    if (typeof ptrName !== "string") throw new Error("invalid pointer target");
    const { targetVal } = getBindingTarget(ptrName);
    if (!isArrayInstance(targetVal)) {
      if (kind === "index") throw new Error("cannot index non-array value");
      throw new Error("cannot access field on non-array value");
    }
    return targetVal;
  }

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
