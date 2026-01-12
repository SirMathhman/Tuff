import type { Env, EnvItem, FunctionValue, StructValue } from "./types";
import { interpret } from "./interpret";
import {
  ensure,
  ensureCloseParen,
  ensureIdentifier,
  ensureIndexFound,
  ensureUniqueDeclaration,
  extractParenContent,
  findMatchingParen,
  parseFieldDef,
  parseIdentifierAt,
  sliceTrim,
  splitTopLevelOrEmpty,
  startsWithKeyword,
  topLevelSplitTrim,
  isIdentifierName,
  interpretAllAny,
  ensureExistsInEnv,
  getLinearDestructor,
  assertCanMoveBinding,
  parseMethodCall,
  isObjectWithKey,
} from "./shared";
import {
  parseParamTypesFromSignature,
  parseGenericParamsFromSignature,
  isValueCompatibleWithParam,
  substituteGenericTypes,
  inferGenericBindingsForCall,
  computeConcreteParamTypes,
} from "./signatures";
import { evalBlock, handleYieldValue } from "./statements";
import { isReturnValue, ReturnValue } from "./returns";
import { parseFnSignature } from "./typeParsers";
import { runFunctionWithBindings, checkMethodArgumentTypes, validateConcreteParamTypes } from "./functionHelpers";

export function handleFnStatement(
  stmt: string,
  env: Env,
  localDeclared: Set<string>
): number {
  let rest = sliceTrim(stmt, 3);
  const nameRes = parseIdentifierAt(rest, 0);
  if (!nameRes) throw new Error("Invalid fn declaration");
  const name = nameRes.name;
  ensureUniqueDeclaration(localDeclared, name);

  rest = sliceTrim(rest, nameRes.next);
  const { content: paramsContent, close } = extractParenContent(rest, "fn");
  const params = parseFnParams(paramsContent);

  let restAfterParams = rest.slice(close + 1).trim();
  // accept optional return type annotation
  const arrowIdx = ensureIndexFound(
    restAfterParams.indexOf("=>"),
    "Invalid fn declaration"
  );
  restAfterParams = sliceTrim(restAfterParams, arrowIdx + 2);

  let body = restAfterParams;
  if (body.startsWith("{")) {
    const bc = findMatchingParen(body, 0);
    if (bc < 0) throw new Error("Unterminated fn body");
    body = body.slice(0, bc + 1);
  }

  const func: FunctionValue = { params, body, env: new Map(env) };
  const sig = parseFnSignature(stmt);
  const item: EnvItem = { value: func, mutable: false, type: sig || "Fn" };
  env.set(name, item);
  return NaN;
}

function bindParamsToEnv(
  targetEnv: Map<string, EnvItem>,
  params: string[],
  values: unknown[]
) {
  for (let i = 0; i < params.length; i++) {
    targetEnv.set(params[i], {
      value: values[i] as EnvItem["value"],
      mutable: false,
    } as EnvItem);
  }
}

function createThisStructAndBindToEnv(
  callEnv: Map<string, EnvItem>,
  params: string[],
  argVals: unknown[]
): StructValue {
  const sv: StructValue = {
    fields: params.slice(),
    values: argVals.slice() as number[],
  };
  callEnv.set("this", { value: sv, mutable: false, type: "This" } as EnvItem);
  return sv;
}

function isFunctionValue(v: unknown): v is FunctionValue {
  return isObjectWithKey(v, "params");
}

function attachMethodsToStructFromEnv(
  sv: StructValue,
  callEnv: Map<string, EnvItem>,
  funcEnv: Map<string, EnvItem>
) {
  for (const [k, v] of callEnv.entries()) {
    if (!funcEnv.has(k) && isFunctionValue(v.value)) {
      if (!sv.methods) sv.methods = new Map<string, FunctionValue>();
      sv.methods.set(k, v.value as FunctionValue);
    }
  }
}

function resolveMethodFromEnv(
  methodName: string,
  receiverVal: unknown,
  env?: Env
): FunctionValue | undefined {
  // Check global env first
  if (env && env.has(methodName)) {
    const item = env.get(methodName)!;
    if (typeof item.value === "number") throw new Error("Not a function");
    return item.value as FunctionValue;
  }
  // If receiver is a struct, check instance methods
  if (isObjectWithKey(receiverVal, "methods")) {
    const methods: Map<string, FunctionValue> | undefined = (
      receiverVal as StructValue
    ).methods;
    if (methods && methods.has(methodName))
      return methods.get(methodName) as FunctionValue;
  }
  return undefined;
}

function extractAfterArrow(s: string, msg: string) {
  const arrowIdx = ensureIndexFound(s.indexOf("=>"), msg);
  return sliceTrim(s, arrowIdx + 2);
}

function parseFnParams(paramsContent: string): string[] {
  const paramsRaw = topLevelSplitTrim(paramsContent, ",");
  return paramsRaw.map((p) => {
    const { name } = parseFieldDef(p);
    return ensureIdentifier(name, "Invalid fn parameter");
  });
}


function topLevelStatements(body: string): string[] {
  const b = body.trim();
  let inner = b;
  if (b.startsWith("{") && b.endsWith("}")) inner = b.slice(1, b.length - 1);
  return topLevelSplitTrim(inner, ";")
    .map((p) => p.trim())
    .filter((p) => p !== "");
}

function registerTopLevelFns(body: string, callEnv: Map<string, EnvItem>) {
  const parts = topLevelStatements(body);
  for (const p of parts) {
    if (p.startsWith("fn ")) {
      // register into callEnv so it will be present for attachment
      handleFnStatement(p, callEnv, new Set<string>());
    }
  }
}

function bodyEndsWithThis(body: string): boolean {
  const b = body.trim();
  if (b === "this" || b === "this;") return true;
  const parts = topLevelStatements(b);
  if (parts.length === 0) return false;
  const last = parts[parts.length - 1];
  if (last === "this" || last === "this;") return true;
  return false;
}

function evalAllButLastStatements(body: string, callEnv: Map<string, EnvItem>) {
  const parts = topLevelStatements(body);
  // evaluate all but the last
  for (let i = 0; i < parts.length - 1; i++) {
    handleYieldValue(() => evalBlock(parts[i], callEnv, true));
  }
}

function callFunctionValue(
  func: FunctionValue,
  argVals: unknown[],
  envForMethodAttachment?: Env
): unknown {
  const callEnv = new Map<string, EnvItem>(func.env);
  bindParamsToEnv(callEnv, func.params, argVals);

  const thisStruct = createThisStructAndBindToEnv(
    callEnv,
    func.params,
    argVals
  );
  // If the function body is simply `this`, return the struct directly (with methods attached)
  const bodyTrim = func.body.trim();
  if (bodyTrim === "this" || bodyTrim === "this;") {
    attachMethodsToStructFromEnv(thisStruct, callEnv, func.env);
    return thisStruct;
  }

  registerTopLevelFns(func.body, callEnv);

  if (bodyEndsWithThis(func.body)) {
    evalAllButLastStatements(func.body, callEnv);
    attachMethodsToStructFromEnv(thisStruct, callEnv, func.env);
    return thisStruct;
  }

  // evaluate body and handle yield; catch function-level returns
  let bodyResult: unknown;
  try {
    bodyResult = handleYieldValue(() => evalBlock(func.body, callEnv, true));
  } catch (e: unknown) {
    if (isReturnValue(e)) return (e as ReturnValue).value;
    throw e;
  }

  if (bodyResult === (thisStruct as unknown)) {
    attachMethodsToStructFromEnv(thisStruct, callEnv, func.env);
  }

  // keep envForMethodAttachment for future; currently methods are attached from captured env
  void envForMethodAttachment;
  return bodyResult;
}

export function callNamedFunction(
  fnName: string,
  argVals: unknown[],
  env: Env
): unknown {
  ensureExistsInEnv(fnName, env);
  const item = env.get(fnName)!;
  if (typeof item.value === "number") throw new Error("Not a function");
  const func = item.value as FunctionValue;
  if (func.params.length !== argVals.length)
    throw new Error("Argument count mismatch");
  return callFunctionValue(func, argVals, env);
}

export function tryHandleCall(s: string, env?: Env): unknown | undefined {
  const idRes = parseIdentifierAt(s, 0);
  if (!idRes) return undefined;
  const rest = sliceTrim(s, idRes.next);
  if (!rest.startsWith("(")) return undefined;
  const close = findMatchingParen(rest, 0);
  if (close < 0) throw new Error("Unterminated call");
  const argsContent = rest.slice(1, close).trim();
  const args = splitTopLevelOrEmpty(argsContent, ",");
  const trailing = rest.slice(close + 1).trim();
  if (trailing !== "") return undefined; // not a pure call expression

  ensureExistsInEnv(idRes.name, env);
  const item = env!.get(idRes.name)!;
  if (typeof item.value === "number") throw new Error("Not a function");
  const func = item.value as FunctionValue;
  if (func.params.length !== args.length)
    throw new Error("Argument count mismatch");

  const paramTypes = parseParamTypesFromSignature(item.type);
  const concreteParamTypes = computeConcreteParamTypes(
    item.type,
    paramTypes,
    args,
    env
  );
  validateConcreteParamTypes(concreteParamTypes, args, env);

  const argVals = args.map((a) => {
    const at = a.trim();
    if (env && isIdentifierName(at) && env.has(at)) {
      const argItem = env.get(at)!;
      if (argItem.type === "__deleted__") throw new Error("Unknown identifier");
      if (argItem.moved) throw new Error("Use-after-move");
      const destructor = getLinearDestructor(argItem.type, env);
      if (destructor) {
        // move linear binding when passed to call
        assertCanMoveBinding(env, at);
        argItem.moved = true;
        env.set(at, argItem);
        return argItem.value;
      }
      // otherwise pass the underlying value (pointer, function, number, etc.)
      return argItem.value;
    }
    return interpret(a, env);
  });

  return callFunctionValue(func, argVals, env);
}

export function tryHandleFnExpression(
  s: string,
  env?: Env
): unknown | undefined {
  const ss = s.trim();
  if (!startsWithKeyword(ss, "fn")) return undefined;

  // allow optional name for expression form: fn name?(...) => { ... }
  let rest = sliceTrim(ss, 2);
  // If the fn keyword is immediately followed by '(', treat as anonymous; otherwise
  // attempt to parse an optional name token.
  const nameRes = rest.startsWith("(") ? undefined : parseIdentifierAt(rest, 0);
  let name: string | undefined = undefined;
  if (nameRes) {
    name = nameRes.name;
    rest = sliceTrim(rest, nameRes.next);
  }

  // find params
  const paren = rest.indexOf("(");
  ensure(paren !== -1, "Invalid fn declaration");
  const close = findMatchingParen(rest, paren);
  ensureCloseParen(close, "Unterminated fn params");

  const paramsContent = rest.slice(paren + 1, close);
  const params = parseFnParams(paramsContent);

  rest = sliceTrim(rest, close + 1);
  rest = extractAfterArrow(rest, "Invalid fn declaration");

  // support both braced and expression bodies for expression-form functions
  let body: string;
  let trailing: string;
  if (rest.startsWith("{")) {
    const bc = findMatchingParen(rest, 0);
    if (bc < 0) throw new Error("Unterminated fn body");
    body = rest.slice(0, bc + 1);
    trailing = rest.slice(bc + 1).trim();
  } else {
    // treat the remainder as a single-expression body
    body = `{ ${rest} }`;
    trailing = "";
  }

  // create a function value that can be returned or registered in a local env
  const funcEnv = new Map<string, EnvItem>(env ?? new Map<string, EnvItem>());
  const func: FunctionValue = { params, body, env: funcEnv };

  if (name) {
    // bind the function to its name in the created env to support recursion
    const sig = parseFnSignature(ss);
    funcEnv.set(name, {
      value: func,
      mutable: false,
      type: sig || "Fn",
    } as EnvItem);
  }

  // If this is a bare fn expression (no trailing), return the function value
  if (trailing === "") return func;

  // Otherwise, evaluate the trailing expression in an env that contains the function
  const res = interpret(trailing, funcEnv);
  if (typeof res !== "number") throw new Error("Expected numeric result");
  return res as number;
}

export function tryHandleArrowFunctionExpression(
  s: string,
  env?: Env
): unknown | undefined {
  const ss = s.trim();
  if (!ss.startsWith("(")) return undefined;
  const parenOpen = ss.indexOf("(");
  const close = findMatchingParen(ss, parenOpen);
  if (close < 0) return undefined;
  // ensure '=>' follows at top-level
  let idx = close + 1;
  while (idx < ss.length && ss[idx] === " ") idx++;
  if (ss.slice(idx, idx + 2) !== "=>") return undefined;

  const paramsContent = ss.slice(parenOpen + 1, close);
  const params = parseFnParams(paramsContent);

  // extract body after '=>'
  let body = ss.slice(idx + 2).trim();
  if (body === "") return undefined;
  // if body is expression (not braced) wrap in braces
  if (!body.startsWith("{")) body = `{ ${body} }`;

  const funcEnv = new Map<string, EnvItem>(env ?? new Map<string, EnvItem>());
  const func: FunctionValue = { params, body, env: funcEnv };
  return func;
}

export function tryHandleFunctionLikeExpression(
  s: string,
  env?: Env
): unknown | undefined {
  const fnExpr = tryHandleFnExpression(s, env);
  if (fnExpr !== undefined) return fnExpr;
  return tryHandleArrowFunctionExpression(s, env);
}


// eslint-disable-next-line max-lines-per-function, complexity
export function tryHandleMethodCall(s: string, env?: Env): number | undefined {
  const parsed = parseMethodCall(s);
  if (!parsed) return undefined;
  const { left, method, args } = parsed;

  let receiverVal: unknown;
  if (isIdentifierName(left) && env && env.has(left)) {
    receiverVal = env.get(left)!.value;
  } else {
    receiverVal = interpret(left, env);
  }
  const func = resolveMethodFromEnv(method, receiverVal, env);
  if (!func) throw new Error("Unknown identifier");

  // Perform runtime type-checking when a signature is available in the env
  let sig: string | undefined = undefined;
  if (env && env.has(method)) sig = env.get(method)!.type;
  const paramTypes = parseParamTypesFromSignature(sig);
  const genericParams = parseGenericParamsFromSignature(sig);

  // If generics present, attempt to infer bindings and substitute
  let concreteParamTypes = paramTypes;
  if (paramTypes && genericParams && genericParams.length > 0) {
    const argExprsForInference =
      func.params.length === args.length + 1 ? [left, ...args] : args;
    const bindingsMap = inferGenericBindingsForCall(
      paramTypes,
      argExprsForInference,
      genericParams,
      env
    );
    concreteParamTypes = paramTypes.map((pt) =>
      substituteGenericTypes(pt, bindingsMap)
    );
  }

  const argVals = interpretAllAny(args, interpret, env);
  const bindings: Array<[string, unknown]> = [];

  if (func.params.length === args.length + 1) {
    if (
      concreteParamTypes &&
      !isValueCompatibleWithParam(receiverVal, concreteParamTypes[0], env)
    )
      throw new Error("Argument type mismatch");
    // check remaining args
    if (concreteParamTypes)
      checkMethodArgumentTypes(concreteParamTypes, args, env, 1);
    bindings.push([func.params[0], receiverVal]);
    for (let i = 0; i < args.length; i++)
      bindings.push([func.params[i + 1], argVals[i]]);
    return runFunctionWithBindings(func, bindings);
  }

  if (func.params.length === args.length) {
    if (concreteParamTypes)
      checkMethodArgumentTypes(concreteParamTypes, args, env, 0);
    for (let i = 0; i < args.length; i++)
      bindings.push([func.params[i], argVals[i]]);
    return runFunctionWithBindings(func, bindings);
  }

  throw new Error("Argument count mismatch");
}
