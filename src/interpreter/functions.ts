import type { Env, EnvItem, FunctionValue } from "./types";
import { interpret } from "./interpret";
import {
  ensure,
  ensureCloseParen,
  ensureIdentifier,
  ensureIndexFound,
  ensureUniqueDeclaration,
  extractParenContent,
  findMatchingParen,
  interpretAll,
  parseFieldDef,
  parseIdentifierAt,
  sliceTrim,
  splitTopLevelOrEmpty,
  startsWithKeyword,
  topLevelSplitTrim,
} from "./shared";
import { evalBlock, handleYieldValue } from "./statements";

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
  const paramsRaw = topLevelSplitTrim(paramsContent, ",");
  const params = paramsRaw.map((p) => {
    const { name } = parseFieldDef(p);
    return ensureIdentifier(name, "Invalid fn parameter");
  });

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
  const item: EnvItem = { value: func, mutable: false, type: "Fn" };
  env.set(name, item);
  return NaN;
}

function extractAfterArrow(s: string, msg: string) {
  const arrowIdx = ensureIndexFound(s.indexOf("=>"), msg);
  return sliceTrim(s, arrowIdx + 2);
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

  if (!env || !env.has(idRes.name)) throw new Error("Unknown identifier");
  const item = env.get(idRes.name)!;
  if (typeof item.value === "number") throw new Error("Not a function");
  const func = item.value as FunctionValue;
  if (func.params.length !== args.length)
    throw new Error("Argument count mismatch");

  const argVals = interpretAll(args, interpret, env);
  const callEnv = new Map<string, EnvItem>(func.env);
  // bind params
  for (let i = 0; i < func.params.length; i++) {
    callEnv.set(func.params[i], {
      value: argVals[i],
      mutable: false,
    } as EnvItem);
  }

  // Always provide a `this` binding as a struct composed of parameters so
  // `this` or `this.x` can be used in simple constructor-like functions.
  const thisStruct = { fields: func.params.slice(), values: argVals.slice() } as const;
  callEnv.set("this", { value: thisStruct, mutable: false, type: "This" } as EnvItem);

  // If the function body is simply `this`, return the struct directly
  const bodyTrim = func.body.trim();
  if (bodyTrim === "this" || bodyTrim === "this;") {
    return thisStruct;
  }

  // evaluate body and handle yield
  return handleYieldValue(() => evalBlock(func.body, callEnv));
}

export function tryHandleFnExpression(
  s: string,
  env?: Env
): number | undefined {
  const ss = s.trim();
  if (!startsWithKeyword(ss, "fn")) return undefined;

  // find the param list and body boundaries without re-parsing params
  const rest = sliceTrim(ss, 3);
  const paren = rest.indexOf("(");
  ensure(paren !== -1, "Invalid fn declaration");
  const close = findMatchingParen(rest, paren);
  ensureCloseParen(close, "Unterminated fn params");

  let restAfterParams = sliceTrim(rest, close + 1);
  restAfterParams = extractAfterArrow(
    restAfterParams,
    "Invalid fn declaration"
  );

  // only support braced body for expression form (simple and safe)
  if (!restAfterParams.startsWith("{")) return undefined;
  const bc = findMatchingParen(restAfterParams, 0);
  if (bc < 0) throw new Error("Unterminated fn body");
  const body = restAfterParams.slice(0, bc + 1);
  const trailing = restAfterParams.slice(bc + 1).trim();

  const fnStmt = ss.slice(0, ss.indexOf(body) + body.length);
  const actualEnv = env ?? new Map<string, EnvItem>();
  // reuse the existing statement handler to register the function
  handleFnStatement(fnStmt, actualEnv, new Set<string>());

  if (trailing === "") return NaN;
  const res = interpret(trailing, actualEnv);
  if (typeof res !== "number") throw new Error("Expected numeric result");
  return res as number;
}

function parseMethodCall(s: string): MethodCallParse | undefined {
  let depth = 0;
  let lastDot = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === "." && depth === 0) lastDot = i;
  }
  if (lastDot === -1) return undefined;

  const left = s.slice(0, lastDot).trim();
  const right = s.slice(lastDot + 1).trim();

  const idRes = parseIdentifierAt(right, 0);
  if (!idRes) return undefined;
  const methodName = idRes.name;

  const rest = sliceTrim(right, idRes.next);
  if (!rest.startsWith("(")) return undefined;
  const close = findMatchingParen(rest, 0);
  if (close < 0) return undefined;
  const argsContent = rest.slice(1, close).trim();
  const args = splitTopLevelOrEmpty(argsContent, ",");
  const trailing = rest.slice(close + 1).trim();
  if (trailing !== "") return undefined;
  return { left, method: methodName, args };
}

interface MethodCallParse {
  left: string;
  method: string;
  args: string[];
}

export function tryHandleMethodCall(s: string, env?: Env): number | undefined {
  const parsed = parseMethodCall(s);
  if (!parsed) return undefined;
  const { left, method, args } = parsed;

  if (!env || !env.has(method)) throw new Error("Unknown identifier");
  const item = env.get(method)!;
  if (typeof item.value === "number") throw new Error("Not a function");
  const func = item.value as FunctionValue;

  const receiverVal = interpret(left, env);

  if (func.params.length !== args.length + 1)
    throw new Error("Argument count mismatch");

  const argVals = interpretAll(args, interpret, env);
  const callEnv = new Map<string, EnvItem>(func.env);
  callEnv.set(func.params[0], {
    value: receiverVal,
    mutable: false,
  } as EnvItem);
  for (let i = 0; i < args.length; i++) {
    callEnv.set(func.params[i + 1], {
      value: argVals[i],
      mutable: false,
    } as EnvItem);
  }
  return handleYieldValue(() => evalBlock(func.body, callEnv));
}
