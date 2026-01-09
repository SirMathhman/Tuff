/**
 * Functions for evaluating function calls
 */
import {
  isPlainObject,
  isIntOperand,
  isFloatOperand,
  isBoolOperand,
  hasParams,
  hasClosureEnv,
  hasName,
  hasAnnotation,
  hasCallApp,
  getProp,
  isArrayInstance,
  type RuntimeValue,
} from "../types";
import { Env, envClone, envSet, isEnv } from "../env";
import { validateAnnotation } from "../interpret_helpers";
import {
  resolveFunctionFromOperand,
  normalizeBoundThis,
  executeFunctionBody,
} from "./functions";

/**
 * Context for call evaluation - provides access to the environment and evaluator
 */
export interface CallEvaluationContext {
  localEnv: Env;
  evaluateExpr: (expr: string, env: Env) => RuntimeValue;
}

function evaluateCallArgs(
  callAppOperand: unknown,
  ctx: CallEvaluationContext
): unknown[] {
  if (!isPlainObject(callAppOperand)) throw new Error("invalid call");
  if (!hasCallApp(callAppOperand)) throw new Error("invalid call");
  const callArgsRaw = callAppOperand.callApp;
  if (!Array.isArray(callArgsRaw)) throw new Error("invalid call");

  return callArgsRaw.map((a) => {
    if (typeof a !== "string") throw new Error("invalid call argument");
    return ctx.evaluateExpr(a, ctx.localEnv);
  });
}

function assignParamsToCallEnv(
  params: unknown[],
  args: unknown[],
  callEnv: Env
) {
  for (let j = 0; j < params.length; j++) {
    const p = params[j];
    const pname = isPlainObject(p) && hasName(p) ? p.name : p;
    const pann =
      isPlainObject(p) && hasAnnotation(p) ? p.annotation : undefined;
    if (typeof pname !== "string") throw new Error("invalid parameter");
    validateAnnotation(
      typeof pann === "string" || pann === undefined ? pann : undefined,
      args[j]
    );
    envSet(callEnv, pname, args[j]);
  }
}

function createCallEnv(fn: unknown, fnParams: unknown[], args: unknown[]): Env {
  if (!isPlainObject(fn) || !hasClosureEnv(fn) || !fn.closureEnv)
    throw new Error("internal error: missing closure env");
  const fnClosureEnv = fn.closureEnv;
  if (!isEnv(fnClosureEnv))
    throw new Error("internal error: invalid closure env type");

  const callEnv: Env = envClone(fnClosureEnv);
  const boundThis = getProp(fn, "boundThis");
  if (boundThis !== undefined) {
    envSet(callEnv, "this", normalizeBoundThis(boundThis));
  }
  assignParamsToCallEnv(fnParams, args, callEnv);
  return callEnv;
}

function convertNativeArg(a: unknown): unknown {
  if (isIntOperand(a)) return Number(a.valueBig);
  if (isFloatOperand(a)) return a.floatValue;
  if (isBoolOperand(a)) return a.boolValue;
  if (isArrayInstance(a)) return a.elements.map(convertNativeArg);
  return a;
}

function callNativeImpl(nativeFn: Function, fn: unknown, args: unknown[]) {
  const boundThisNative = isPlainObject(fn)
    ? getProp(fn, "boundThis")
    : undefined;
  let jsArgs = args.map(convertNativeArg);
  if (boundThisNative !== undefined)
    jsArgs = [normalizeBoundThis(boundThisNative), ...jsArgs];
  const res = Reflect.apply(nativeFn, undefined, jsArgs);
  if (Array.isArray(res)) {
    const elems = res.map((e) => (typeof e === "number" ? e : e));
    return {
      isArray: true,
      elements: elems,
      length: elems.length,
      initializedCount: elems.length,
    };
  }
  return res;
}

/**
 * Evaluate a function call and return its result
 */
export function evaluateCall(
  funcOperand: unknown,
  callAppOperand: unknown,
  ctx: CallEvaluationContext
): unknown {
  const argOps = evaluateCallArgs(callAppOperand, ctx);

  const fn = resolveFunctionFromOperand(funcOperand, ctx.localEnv);
  if (!isPlainObject(fn) || !hasParams(fn))
    throw new Error("internal error: invalid function");
  const fnParams = fn.params;
  if (!Array.isArray(fnParams))
    throw new Error("internal error: invalid function params");

  if (fnParams.length !== argOps.length)
    throw new Error("invalid argument count");
  const callEnv = createCallEnv(fn, fnParams, argOps);

  // If this function has a native implementation, invoke it directly.
  // `nativeImpl` is stored on the fn object when created by `interpretAllWithNative`.
  const maybeNative = getProp(fn, "nativeImpl");
  if (typeof maybeNative === "function") {
    return callNativeImpl(maybeNative, fn, argOps);
  }

  return executeFunctionBody(fn, callEnv);
}
