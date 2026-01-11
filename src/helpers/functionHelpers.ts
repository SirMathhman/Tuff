import type { Result, Err } from "./result";
import {
  parseLeadingNumber,
  validateSizedInteger,
  substituteAllIdents,
  checkSimpleAnnotation,
  SIZED_TYPES,
  findMatchingParenIndex,
} from "../parsers/interpretHelpers";
import {
  parseFnExpressionAt,
  parseArrowFnExpressionAt,
} from "../parsers/fnDeclHelpers";
import { lookupBinding } from "../control/ifValidators";

interface BindingType {
  value: number;
  suffix?: string;
  assigned?: boolean;
  mutable?: boolean;
}
interface ParsedNumber {
  value: number;
  raw: string;
  end: number;
}
interface ParamDecl {
  name: string;
  ann?: string;
}
interface ArgInit {
  value: number;
  suffix?: string;
}
interface FunctionDescriptor {
  params: ParamDecl[];
  body: string;
  closure?: Map<string, BindingType>;
}
interface BindingWithFn extends BindingType {
  fn?: FunctionDescriptor;
}
interface EnvWithParent extends Map<string, BindingType> {
  __parent?: Map<string, BindingType>;
}

type EvalExprCb = (
  src: string,
  env?: Map<string, unknown>
) => Result<number, string>;

type EvalBlockCb = (
  s: string,
  p?: Map<string, BindingType>,
  l?: Map<string, BindingType>
) => Result<number, string>;

export function parseArgsList(argsInner: string): string[] {
  const args: string[] = [];
  if (!argsInner.length) return args;
  let depth = 0;
  let last = 0;
  for (let q = 0; q < argsInner.length; q++) {
    const ch = argsInner[q];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      args.push(argsInner.slice(last, q).trim());
      last = q + 1;
    }
  }
  args.push(argsInner.slice(last).trim());
  return args;
}

function evaluateSingleArg<T extends BindingType>(
  a: string,
  parentEnv: Map<string, T> | undefined,
  evalExpr: (s: string, p?: Map<string, T>) => Result<number, string>
): Result<ArgInit, string> {
  const aSub = substituteAllIdents(
    a,
    parentEnv as unknown as Map<string, BindingType>
  );
  if (!aSub.ok) return aSub as Err<string>;
  const aval = evalExpr(aSub.value, parentEnv);
  if (!aval.ok) return aval as Err<string>;
  const parsed = parseLeadingNumber(aSub.value);
  let suffix: string | undefined;
  if (parsed && parsed.end < aSub.value.length) {
    const rest = aSub.value.slice(parsed.end).trim();
    // manual identifier check
    if (rest.length > 0) {
      let ok = true;
      for (let i = 0; i < rest.length; i++) {
        const cc = rest.charCodeAt(i);
        if (
          !(
            (cc >= 65 && cc <= 90) ||
            (cc >= 97 && cc <= 122) ||
            (cc >= 48 && cc <= 57) ||
            cc === 95
          )
        ) {
          ok = false;
          break;
        }
      }
      if (ok) suffix = rest;
    }
  }
  return { ok: true, value: { value: aval.value, suffix } };
}

function evaluateArgInits<T extends BindingType>(
  args: string[],
  parentEnv: Map<string, T> | undefined,
  evalExpr: (s: string, p?: Map<string, T>) => Result<number, string>
): Result<ArgInit[], string> {
  const argInits: ArgInit[] = [];
  for (const a of args) {
    const res = evaluateSingleArg(a, parentEnv, evalExpr);
    if (!res.ok) return res as Err<string>;
    argInits.push(res.value);
  }
  return { ok: true, value: argInits };
}

function handleSizedAnn(
  ann: string | undefined,
  aStr: string,
  aInit: ArgInit,
  name: string,
  callEnv: Map<string, BindingType>
): Result<boolean, string> {
  if (!ann || !SIZED_TYPES.has(ann)) return { ok: true, value: false };
  if (aStr.trim() === "true" || aStr.trim() === "false")
    return {
      ok: false,
      error: "declaration initializer does not match annotation",
    };
  if (aInit.suffix) {
    if (aInit.suffix !== ann)
      return {
        ok: false,
        error: "declaration initializer does not match annotation",
      };
    const rangeErr = validateSizedInteger(String(aInit.value), ann);
    if (rangeErr) return rangeErr;
    callEnv.set(name, {
      value: aInit.value,
      suffix: aInit.suffix,
    } as BindingType);
    return { ok: true, value: true };
  }
  const rangeErr = validateSizedInteger(String(aInit.value), ann);
  if (rangeErr) return rangeErr;
  callEnv.set(name, { value: aInit.value } as BindingType);
  return { ok: true, value: true };
}

function handleSimpleAnn(
  ann: string | undefined,
  aInit: ArgInit,
  aStr: string,
  parentEnv?: Map<string, BindingType>,
  evalExprCb?: (
    src: string,
    env?: Map<string, unknown>
  ) => Result<number, string>
): Result<boolean, string> {
  const parsedAnn = parseLeadingNumber(ann ?? "");
  const simple = checkSimpleAnnotation(ann ?? "", parsedAnn, aStr, {
    value: aInit.value,
    suffix: aInit.suffix,
  });
  if (simple !== undefined) {
    if (!simple.ok) return simple as Err<string>;
    return { ok: true, value: true };
  }

  const subAnn = substituteAllIdents(
    ann ?? "",
    parentEnv as unknown as Map<string, BindingType>
  );
  if (!subAnn.ok) return subAnn as Err<string>;
  if (!evalExprCb) return { ok: false, error: "internal error" };
  const evalAnn = evalExprCb(
    subAnn.value,
    parentEnv as unknown as Map<string, unknown>
  );
  if (!evalAnn.ok) return evalAnn as Err<string>;
  if (evalAnn.value !== aInit.value)
    return {
      ok: false,
      error: "declaration initializer does not match annotation",
    };
  return { ok: true, value: false };
}

function prepareCallEnv(
  fnParams: ParamDecl[],
  argInits: ArgInit[],
  argStrs: string[],
  parentEnv?: Map<string, BindingType>,
  evalExprCb?: (
    src: string,
    env?: Map<string, unknown>
  ) => Result<number, string>
): Result<Map<string, BindingType>, string> {
  const callEnv = new Map<string, BindingType>();
  for (let idx = 0; idx < fnParams.length; idx++) {
    const ann = fnParams[idx].ann;
    const aStr = argStrs[idx];
    const aInit = argInits[idx];

    const sized = handleSizedAnn(ann, aStr, aInit, fnParams[idx].name, callEnv);
    if (!sized.ok) return sized as Err<string>;
    if (sized.value) continue;

    const simpleRes = handleSimpleAnn(ann, aInit, aStr, parentEnv, evalExprCb);
    if (!simpleRes.ok) return simpleRes as Err<string>;
    if (simpleRes.value) {
      callEnv.set(fnParams[idx].name, {
        value: aInit.value,
        suffix: aInit.suffix,
      } as BindingType);
      continue;
    }

    callEnv.set(fnParams[idx].name, {
      value: aInit.value,
      suffix: aInit.suffix,
    } as BindingType);
  }
  return { ok: true, value: callEnv };
}

interface FunctionCallResult {
  parsed: ParsedNumber;
  operandFull: string;
  nextPos: number;
}

interface IdentArgs {
  name: string;
  parenEnd: number;
  args: string[];
}

function scanIdentEnd(substr: string): number {
  let k = 0;
  while (k < substr.length) {
    const cc = substr.charCodeAt(k);
    const isIdent =
      (cc >= 65 && cc <= 90) ||
      (cc >= 97 && cc <= 122) ||
      cc === 95 ||
      (cc >= 48 && cc <= 57);
    if (isIdent) k++;
    else break;
  }
  return k;
}

function parseIdentAndArgs(s: string, pos: number): IdentArgs | undefined {
  const substr = s.slice(pos);
  if (!substr || substr.length === 0) return undefined;
  const first = substr.charCodeAt(0);
  if (
    !(
      (first >= 65 && first <= 90) ||
      (first >= 97 && first <= 122) ||
      first === 95
    )
  )
    return undefined;
  const k = scanIdentEnd(substr.slice(1)) + 1;
  let j = k;
  while (j < substr.length && substr[j] === " ") j++;
  if (j >= substr.length || substr[j] !== "(") return undefined;
  const parenIdx = pos + j;
  const parenEnd = findMatchingParenIndex(s, parenIdx);
  if (parenEnd === -1) return undefined;
  const argsInner = s.slice(parenIdx + 1, parenEnd).trim();
  const args = parseArgsList(argsInner);
  const name = substr.slice(0, k);
  return { name, parenEnd, args };
}

function getCallableBinding(
  name: string,
  parentEnv: Map<string, BindingType> | undefined
): Result<BindingWithFn, string> {
  if (!parentEnv) return { ok: false, error: `unknown identifier ${name}` };
  const lb = lookupBinding(
    name,
    parentEnv as unknown as Map<string, BindingType>
  );
  if (!lb.ok) return { ok: false, error: lb.error };
  const binding = lb.value as unknown as BindingWithFn;
  if (!binding.fn) return { ok: false, error: `unknown identifier ${name}` };
  return { ok: true, value: binding };
}

export function callFunctionRawFromString(
  s: string,
  parentEnv: Map<string, BindingType> | undefined,
  evalExprCb: EvalExprCb,
  evalBlockCb?: EvalBlockCb
): Result<number | BindingWithFn, string> {
  const parsed = parseIdentAndArgs(s, 0);
  if (!parsed) return { ok: false, error: "invalid function invocation" };
  const { name, args } = parsed;
  return callFunctionRaw(name, args, parentEnv, evalExprCb, evalBlockCb);
}

export function callFunctionRaw(
  name: string,
  args: string[],
  parentEnv: Map<string, BindingType> | undefined,
  evalExprCb: EvalExprCb,
  evalBlockCb?: EvalBlockCb
): Result<number | BindingWithFn, string> {
  const bindingRes = getCallableBinding(name, parentEnv);
  if (!bindingRes.ok) return bindingRes as Err<string>;
  const binding = bindingRes.value as BindingWithFn;

  return executeBindingCall(binding, args, parentEnv, evalExprCb, evalBlockCb);
}

function executeBindingCall(
  binding: BindingWithFn,
  args: string[],
  parentEnv: Map<string, BindingType> | undefined,
  evalExprCb: EvalExprCb,
  evalBlockCb?: EvalBlockCb
): Result<number, string> {
  const fnParams = binding.fn?.params as ParamDecl[] | undefined;
  if (!fnParams) return { ok: false, error: "invalid function" };
  if (fnParams.length !== args.length)
    return { ok: false, error: "invalid function invocation" };

  const argRes = evaluateArgInits(args, parentEnv, evalExprCb);
  if (!argRes.ok) return argRes as Err<string>;
  const argInits = argRes.value;

  const callEnvRes = prepareCallEnv(
    fnParams,
    argInits,
    args,
    parentEnv as unknown as Map<string, BindingType>,
    evalExprCb
  );
  if (!callEnvRes.ok) return callEnvRes as Err<string>;
  const callEnv = callEnvRes.value as Map<string, BindingType>;

  (callEnv as unknown as EnvWithParent).__parent = binding.fn?.closure as
    | Map<string, BindingType>
    | undefined;

  const bodyRes = evaluateFunctionBody(
    binding.fn?.body as string,
    binding.fn?.closure as Map<string, BindingType>,
    callEnv,
    evalExprCb,
    evalBlockCb
  );
  if (!bodyRes.ok) return bodyRes as Err<string>;
  return { ok: true, value: bodyRes.value };
}

function invokeCallableBinding(
  binding: BindingWithFn,
  args: string[],
  parentEnv: Map<string, BindingType>,
  evalExprCb: EvalExprCb,
  evalBlockCb?: EvalBlockCb
): Result<number, string> {
  return executeBindingCall(binding, args, parentEnv, evalExprCb, evalBlockCb);
}

export function tryReadFunctionCallAt(
  s: string,
  pos: number,
  parentEnv: Map<string, BindingType> | undefined,
  evalExprCb: EvalExprCb,
  evalBlockCb?: EvalBlockCb
): Result<FunctionCallResult, string> | undefined {
  const parsed = parseIdentAndArgs(s, pos);
  if (!parsed) return undefined;
  const { name, parenEnd, args } = parsed;
  const bindingRes = getCallableBinding(name, parentEnv);
  if (!bindingRes.ok) return bindingRes;
  const binding = bindingRes.value;

  const chosenValRes = invokeCallableBinding(
    binding,
    args,
    parentEnv as Map<string, BindingType>,
    evalExprCb,
    evalBlockCb
  );
  if (!chosenValRes.ok) return chosenValRes as Err<string>;
  const chosenVal = chosenValRes.value;

  const parsedNum: ParsedNumber = {
    value: chosenVal,
    raw: String(chosenVal),
    end: String(chosenVal).length,
  };
  const operandFull = s.slice(pos, parenEnd + 1).trim();
  return {
    ok: true,
    value: { parsed: parsedNum, operandFull, nextPos: parenEnd + 1 },
  };
}

function evaluateFunctionBody(
  fnBody: string,
  closure: Map<string, BindingType> | undefined,
  callEnv: Map<string, BindingType>,
  evalExprCb: EvalExprCb,
  evalBlockCb?: EvalBlockCb
): Result<number | BindingWithFn, string> {
  if (
    fnBody.indexOf(";") !== -1 ||
    fnBody.startsWith("let ") ||
    (fnBody.indexOf("=") !== -1 && fnBody.indexOf("=>") === -1)
  ) {
    if (!evalBlockCb) return { ok: false, error: "internal error" };
    const br = evalBlockCb(
      fnBody,
      closure as Map<string, BindingType>,
      callEnv as unknown as Map<string, BindingType>
    );
    if (!br.ok) return br as Err<string>;
    return { ok: true, value: br.value };
  }
  return evaluateFunctionBodyExpr(fnBody, closure, callEnv, evalExprCb);
}

function evaluateFunctionBodyExpr(
  fnBody: string,
  closure: Map<string, BindingType> | undefined,
  callEnv: Map<string, BindingType>,
  evalExprCb: EvalExprCb
): Result<number | BindingWithFn, string> {
  const trimmed = fnBody.trim();
  // detect immediate function expressions being returned (e.g., `fn (y) => x + y` or `(y) => x + y`)
  const fnExpr =
    parseFnExpressionAt(trimmed, 0) ?? parseArrowFnExpressionAt(trimmed, 0);
  if (fnExpr && fnExpr.ok) {
    return {
      ok: true,
      value: buildReturnedFunctionBinding(fnExpr.value, callEnv, closure),
    };
  }

  const sub = substituteAllIdents(
    fnBody,
    callEnv as unknown as Map<string, BindingType>
  );
  if (!sub.ok) return sub as Err<string>;
  const v = evalExprCb(sub.value, callEnv as unknown as Map<string, unknown>);
  if (!v.ok) return v as Err<string>;
  return { ok: true, value: v.value };
}

function buildReturnedFunctionBinding(
  fnExpr: FunctionDescriptor,
  callEnv: Map<string, BindingType>,
  closure: Map<string, BindingType> | undefined
): BindingWithFn {
  const newClosure = new Map<string, BindingType>();
  for (const [k, v] of callEnv)
    newClosure.set(k, { value: v.value, suffix: v.suffix });
  (newClosure as unknown as EnvWithParent).__parent = closure as
    | Map<string, BindingType>
    | undefined;
  return {
    value: 0,
    assigned: true,
    fn: { params: fnExpr.params, body: fnExpr.body, closure: newClosure },
  };
}
