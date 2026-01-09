/**
 * Function resolution and execution helpers for the Tuff interpreter.
 * Extracted from eval.ts to comply with max-lines ESLint rule.
 */
import { splitTopLevelStatements } from "../parser";
import { convertOperandToNumber } from "../interpret_helpers";
import { Env, envHas, envGet, envEntries } from "../env";
import {
  isPlainObject,
  isBoolOperand,
  isFloatOperand,
  isIntOperand,
  isStructDef,
  isFnWrapper,
  hasIdent,
  hasValue,
  hasParams,
  hasClosureEnv,
  hasBody,
  hasIsBlock,
  hasName,
  getProp,
  isArrayInstance,
  RuntimeValue,
} from "../types";

interface FieldValuesMap {
  [k: string]: unknown;
}

interface ThisBinding {
  isThisBinding: true;
  fieldValues: FieldValuesMap;
}

interface FunctionObject {
  [k: string]: unknown;
}

interface FunctionWrapper {
  fn: FunctionObject;
}

// Forward declaration - will be set by eval.ts to avoid circular imports
let evaluateReturningOperandFn:
  | ((exprStr: string, env: Env) => unknown)
  | undefined;

export function setEvaluateReturningOperand(
  fn: (exprStr: string, env: Env) => unknown
): void {
  evaluateReturningOperandFn = fn;
}

export function mustGetEnvBinding(env: Env, name: string): RuntimeValue {
  if (!envHas(env, name)) throw new Error(`unknown identifier ${name}`);
  return envGet(env, name);
}

export function resolveFunctionFromOperand(
  operand: unknown,
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
export function normalizeBoundThis(val: unknown): RuntimeValue {
  let thisVal: RuntimeValue = val;
  if (
    isIntOperand(thisVal) ||
    isFloatOperand(thisVal) ||
    isBoolOperand(thisVal)
  )
    thisVal = convertOperandToNumber(thisVal);
  if (isArrayInstance(thisVal)) {
    return thisVal.elements.map((e: unknown) => {
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
  origFn: unknown,
  boundThis: unknown
): FunctionWrapper {
  if (!isPlainObject(origFn)) throw new Error("internal error: invalid fn");
  return { fn: buildBoundFnFromOrig(origFn, boundThis) };
}

function buildBoundFnFromOrig(
  origFn: unknown,
  boundThis: unknown
): FunctionObject {
  const boundFn: FunctionObject = {};

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

// helper to build a `this` binding object from an env
function buildThisBindingFromEnv(envLocal: Env): ThisBinding {
  const thisObj: ThisBinding = {
    isThisBinding: true,
    fieldValues: {},
  };
  for (const [k, envVal] of envEntries(envLocal)) {
    if (k === "this") continue;
    if (
      isPlainObject(envVal) &&
      hasValue(envVal) &&
      envVal.value !== undefined
    ) {
      thisObj.fieldValues[k] = envVal.value;
    } else if (
      typeof envVal === "number" ||
      typeof envVal === "string" ||
      typeof envVal === "boolean"
    ) {
      thisObj.fieldValues[k] = envVal;
    } else if (!isStructDef(envVal)) {
      thisObj.fieldValues[k] = envVal;
    }
  }
  return thisObj;
}

/**
 * Execute a function body and return the result
 * Handles both block bodies (executed via interpret) and expression bodies
 */
export function executeFunctionBody(fn: unknown, callEnv: Env): RuntimeValue {
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
