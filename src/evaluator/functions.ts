/**
 * Function resolution and execution helpers for the Tuff interpreter.
 * Extracted from eval.ts to comply with max-lines ESLint rule.
 */
import { splitTopLevelStatements } from "../parser";
import { convertOperandToNumber } from "../interpreter_helpers";
import { Env, envHas, envGet } from "../runtime/env";
import {
  isPlainObject,
  isBoolOperand,
  isFloatOperand,
  isIntOperand,
  isFnWrapper,
  hasIdent,
  hasParams,
  hasClosureEnv,
  hasBody,
  hasIsBlock,
  hasName,
  getProp,
  isArrayInstance,
  RuntimeValue,
  FnWrapper,
  FunctionObject,
} from "../runtime/types";
import { buildThisBindingFromEnv } from "./pure_helpers";

// Forward declaration - will be set by eval.ts to avoid circular imports
let evaluateReturningOperandFn:
  | ((exprStr: string, env: Env) => RuntimeValue)
  | undefined;

export function setEvaluateReturningOperand(
  fn: (exprStr: string, env: Env) => RuntimeValue
): void {
  evaluateReturningOperandFn = fn;
}

export function mustGetEnvBinding(env: Env, name: string): RuntimeValue {
  if (!envHas(env, name)) throw new Error(`unknown identifier ${name}`);
  return envGet(env, name);
}

export function resolveFunctionFromOperand(
  operand: RuntimeValue,
  localEnv: Env
): RuntimeValue {
  if (isFnWrapper(operand)) {
    return operand.fn;
  } else if (hasIdent(operand)) {
    const name = operand.ident;
    const binding = mustGetEnvBinding(localEnv, name);
    if (!isFnWrapper(binding)) throw new Error("not a function");
    return binding.fn;
  } else {
    throw new Error("cannot call non-function");
  }
}

// Normalize a bound `this` value for either call environments or JS native
// argument passing so the same conversion rules are applied in both places.
export function normalizeBoundThis(val: RuntimeValue): RuntimeValue {
  let thisVal: RuntimeValue = val;
  if (
    isIntOperand(thisVal) ||
    isFloatOperand(thisVal) ||
    isBoolOperand(thisVal)
  )
    thisVal = convertOperandToNumber(thisVal);
  if (isArrayInstance(thisVal)) {
    return thisVal.elements.map((e: RuntimeValue) => {
      if (isIntOperand(e)) return Number(e.valueBig);
      if (isFloatOperand(e)) return e.floatValue;
      if (isBoolOperand(e)) return e.boolValue;
      return e;
    });
  }
  return thisVal;
}

// Create a bound function wrapper from an original fn object and a boundThis
export function makeBoundWrapperFromOrigFn(
  origFn: RuntimeValue,
  boundThis: RuntimeValue
): FnWrapper {
  if (!isPlainObject(origFn)) throw new Error("internal error: invalid fn");
  return { type: "fn-wrapper", fn: buildBoundFnFromOrig(origFn, boundThis) };
}

function buildBoundFnFromOrig(
  origFn: RuntimeValue,
  boundThis: RuntimeValue
): FunctionObject {
  const boundFn: FunctionObject = {
    params: [],
    body: "",
    isBlock: false,
  };

  // params
  if (hasParams(origFn) && Array.isArray(origFn.params)) {
    const origParams = origFn.params;
    if (origParams.length > 0) {
      const first = origParams[0];
      const firstName =
        isPlainObject(first) && hasName(first) ? first.name : first;
      boundFn.params =
        typeof firstName === "string" && firstName === "this"
          ? origParams.slice(1)
          : origParams;
    } else boundFn.params = [];
  }

  // body, flags, annotations, closure, and nativeImpl
  if (hasBody(origFn) && typeof origFn.body === "string")
    boundFn.body = origFn.body;
  if (hasIsBlock(origFn)) boundFn.isBlock = origFn.isBlock;
  const resAnn = getProp(origFn, "resultAnnotation");
  if (typeof resAnn === "string") boundFn.resultAnnotation = resAnn;
  if (hasClosureEnv(origFn) && origFn.closureEnv)
    boundFn.closureEnv = origFn.closureEnv;
  const nativeMaybe = getProp(origFn, "nativeImpl");
  if (typeof nativeMaybe === "function") boundFn.nativeImpl = nativeMaybe;

  boundFn.boundThis = boundThis;
  return boundFn;
}

/**
 * Execute a function body and return the result
 * Handles both block bodies (executed via interpret) and expression bodies
 */
export function executeFunctionBody(
  fn: RuntimeValue,
  callEnv: Env
): RuntimeValue {
  if (!isPlainObject(fn)) throw new Error("internal error: invalid fn");
  const isBlock = hasIsBlock(fn) && fn.isBlock === true;
  if (!hasBody(fn) || typeof fn.body !== "string") {
    throw new Error("internal error: invalid fn body");
  }
  const body = fn.body;

  if (!isBlock) {
    if (!evaluateReturningOperandFn) {
      throw new Error(
        "internal error: evaluateReturningOperand not initialized"
      );
    }
    return evaluateReturningOperandFn(body, callEnv);
  }

  const inner = body.replace(/^\{\s*|\s*\}$/g, "");

  // Determine the last top-level statement without importing helpers to avoid
  // circular import issues.
  const parts = splitTopLevelStatements(inner)
    .map((p) => p.trim())
    .filter(Boolean);
  const lastStmt = parts.length ? parts[parts.length - 1] : undefined;

  // interpret() mutates the provided env in-place for statement-like inputs.
  // We expose it on globalThis in src/interpret.ts to avoid circular imports.
  const interpFunc = globalThis.interpret;
  if (typeof interpFunc !== "function") {
    throw new Error("internal error: interpret() is not available");
  }

  if (lastStmt && lastStmt === "this") {
    // Execute everything *except* the trailing `this` statement.
    // interpret() always returns a number and will throw if the last expression
    // is non-numeric (like our `this` binding object). We still want all prior
    // statements (nested fn declarations, assignments) to run so they populate
    // the call env.
    const prelude = parts.slice(0, -1).join("; ");
    if (prelude.trim() !== "") interpFunc(prelude, callEnv);

    // Build `this` binding directly from the call env to ensure nested functions
    // declared inside the block are included as direct fields on the resulting
    // `this` object (methods should be callable via `this.method`).
    return buildThisBindingFromEnv(callEnv);
  }

  // Execute the block body normally and return its result. Use interpret on the
  // inner content so that nested declarations mutate the provided call env.
  return interpFunc(inner, callEnv);
}
