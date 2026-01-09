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
  evaluateExpr: (expr: string, env: Env) => unknown;
}

/**
 * Evaluate a function call and return its result
 */
export function evaluateCall(
  funcOperand: unknown,
  callAppOperand: unknown,
  ctx: CallEvaluationContext
): unknown {
  if (!isPlainObject(callAppOperand)) throw new Error("invalid call");

  if (!hasCallApp(callAppOperand)) throw new Error("invalid call");
  const callArgsRaw = callAppOperand.callApp;
  if (!Array.isArray(callArgsRaw)) throw new Error("invalid call");

  const argOps = callArgsRaw.map((a) => {
    if (typeof a !== "string") throw new Error("invalid call argument");
    return ctx.evaluateExpr(a, ctx.localEnv);
  });

  const fn = resolveFunctionFromOperand(funcOperand, ctx.localEnv);
  if (!isPlainObject(fn) || !hasParams(fn))
    throw new Error("internal error: invalid function");
  const fnParams = fn.params;
  if (!Array.isArray(fnParams))
    throw new Error("internal error: invalid function params");
  if (!hasClosureEnv(fn) || !fn.closureEnv)
    throw new Error("internal error: missing closure env");
  const fnClosureEnv = fn.closureEnv;
  if (!isEnv(fnClosureEnv))
    throw new Error("internal error: invalid closure env type");

  if (fnParams.length !== argOps.length)
    throw new Error("invalid argument count");

  const callEnv: Env = envClone(fnClosureEnv);
  // If this function wrapper has a bound `this`, expose it on the callEnv
  // so that functions may access `this` as a variable inside the body.
  const boundThis = getProp(fn, "boundThis");
  if (boundThis !== undefined) {
    envSet(callEnv, "this", normalizeBoundThis(boundThis));
  }

  for (let j = 0; j < fnParams.length; j++) {
    const p = fnParams[j];
    const pname = isPlainObject(p) && hasName(p) ? p.name : p;
    const pann =
      isPlainObject(p) && hasAnnotation(p) ? p.annotation : undefined;
    if (typeof pname !== "string") throw new Error("invalid parameter");
    validateAnnotation(
      typeof pann === "string" || pann === undefined ? pann : undefined,
      argOps[j]
    );
    envSet(callEnv, pname, argOps[j]);
  }

  // If this function has a native implementation, invoke it directly.
  // `nativeImpl` is stored on the fn object when created by `interpretAllWithNative`.
  const maybeNative = getProp(fn, "nativeImpl");
  if (typeof maybeNative === "function") {
    const convertArg = (a: unknown): unknown => {
      if (isIntOperand(a)) return Number(a.valueBig);
      if (isFloatOperand(a)) return a.floatValue;
      if (isBoolOperand(a)) return a.boolValue;
      if (isArrayInstance(a)) return a.elements.map(convertArg);
      return a;
    };
    let jsArgs = argOps.map(convertArg);
    // If this function wrapper has a bound `this`, include it as the
    // first JS argument so native implementations can observe receiver
    // semantics when declared as `extern fn name(this : T, ...)`.
    const boundThisNative = getProp(fn, "boundThis");
    if (boundThisNative !== undefined) {
      jsArgs = [normalizeBoundThis(boundThisNative), ...jsArgs];
    }
    // Use Reflect.apply to call the unknown function safely without type casts
    const res = Reflect.apply(maybeNative, undefined, jsArgs);
    // If native returned a JS array, wrap into an interpreter array instance
    if (Array.isArray(res)) {
      const elems = res.map((e) => {
        // convert primitive JS numbers to number operands (leave as JS number is fine)
        return typeof e === "number" ? e : e;
      });
      return {
        isArray: true,
        elements: elems,
        length: elems.length,
        initializedCount: elems.length,
      };
    }
    return res;
  }
  // debug: inspect x binding in call env and closure env for failing test
  return executeFunctionBody(fn, callEnv);
}
