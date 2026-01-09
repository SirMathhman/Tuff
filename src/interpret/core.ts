import { evaluateReturningOperand } from "../eval";
import { Env, envSet, envGet, envClone } from "../env";
import {
  isBoolOperand,
  isFloatOperand,
  isIntOperand,
  isFnWrapper,
  isPlainObject,
  toErrorMessage,
  type RuntimeValue,
  type FnWrapper as FnWrapperType,
  type PlainObject,
} from "../types";
import type { InterpretFn } from "../types";

export type StringMap = {
  [k: string]: string;
};

/* eslint-disable custom/no-unknown-param -- external API validation */
function validateInterpretAllWithNativeInputs(
  scripts: unknown,
  nativeModules: unknown,
  mainNamespace: unknown
): asserts scripts is StringMap {
  /* eslint-enable custom/no-unknown-param */
  if (!scripts || typeof scripts !== "object")
    throw new Error("scripts must be an object");
  if (!nativeModules || typeof nativeModules !== "object")
    throw new Error("nativeModules must be a string");
  if (typeof mainNamespace !== "string")
    throw new Error("mainNamespace must be a string");
}

function normalizeNamespaceMap(input: StringMap): StringMap {
  const out: StringMap = {};
  for (const k of Object.keys(input)) out[k.replace(/,/g, "::")] = input[k];
  return out;
}

function transformNativeModuleCode(code: string): string {
  // Convert `export function name(...) {` into `exports.name = function (...) {`
  let transformed = code.replace(
    /(^|\n)\s*export\s+function\s+([a-zA-Z_]\w*)\s*\(/g,
    (m, p1, name) => {
      return `${p1}exports.${name} = function (`;
    }
  );
  // Convert `export const/let/var name =` into `exports.name =`
  transformed = transformed.replace(
    /(^|\n)\s*export\s+(?:const|let|var)\s+([a-zA-Z_]\w*)\s*=\s*/g,
    (m, p1, name) => {
      return `${p1}exports.${name} = `;
    }
  );
  // Strip TypeScript-like parameter type annotations (e.g., `value : number`)
  // so host-evaluated native modules may be authored with mild type hints.
  transformed = transformed.replace(/([a-zA-Z_]\w*)\s*:\s*([^\s,)]+)/g, "$1");
  return transformed;
}

export type UnknownMap = {
  [k: string]: RuntimeValue;
};

function evaluateNativeModuleExports(code: string): UnknownMap {
  const exports: UnknownMap = {};
  const transformed = transformNativeModuleCode(code);

  try {
    const fn = new Function("exports", transformed);
    fn(exports);
  } catch (e) {
    throw new Error(`failed to evaluate native module: ${toErrorMessage(e)}`);
  }
  return exports;
}

function collectExportsFromScriptEnv(nsEnv: UnknownMap): UnknownMap {
  const collectedExports: UnknownMap = {};
  if (isPlainObject(nsEnv.__exports)) {
    for (const [kk, vv] of Object.entries(nsEnv.__exports))
      collectedExports[kk] = vv;
  }
  return collectedExports;
}

function mergeNativeExportsInto(
  collectedExports: UnknownMap,
  code: string
): void {
  const nativeExports = evaluateNativeModuleExports(code);
  for (const [k, v] of Object.entries(nativeExports)) {
    if (typeof v === "function") {
      // fn wrapper shape expected by interpreter
      const fnObj: PlainObject = {
        params: [],
        body: "/* native */",
        isBlock: false,
        resultAnnotation: undefined,
        // Provide an empty object env so callers can clone it as a base
        closureEnv: {},
        nativeImpl: v,
      };
      const wrapper: FnWrapperType = {
        type: "fn-wrapper",
        fn: fnObj,
      };
      collectedExports[k] = wrapper;
    } else {
      collectedExports[k] = v;
    }
  }
}

export type NamespaceRegistry = {
  [k: string]: UnknownMap;
};

export interface ResolveNamespaceArgs {
  nsName: string;
  normalizedScripts: StringMap;
  normalizedNative: StringMap;
  namespaceRegistry: NamespaceRegistry;
  interpFn: InterpretFn;
}

function resolveNamespaceToExports(args: ResolveNamespaceArgs): UnknownMap {
  const {
    nsName,
    normalizedScripts,
    normalizedNative,
    namespaceRegistry,
    interpFn,
  } = args;

  if (
    !Object.prototype.hasOwnProperty.call(normalizedScripts, nsName) &&
    !Object.prototype.hasOwnProperty.call(normalizedNative, nsName)
  )
    throw new Error("namespace not found");

  if (!Object.prototype.hasOwnProperty.call(namespaceRegistry, nsName)) {
    const nsEnv: UnknownMap = {};
    nsEnv.__exports = {};

    if (Object.prototype.hasOwnProperty.call(normalizedScripts, nsName)) {
      interpFn(normalizedScripts[nsName], nsEnv);
    }

    const collectedExports = collectExportsFromScriptEnv(nsEnv);
    if (Object.prototype.hasOwnProperty.call(normalizedNative, nsName)) {
      mergeNativeExportsInto(collectedExports, normalizedNative[nsName]);
    }

    namespaceRegistry[nsName] = collectedExports;
  }

  return namespaceRegistry[nsName];
}

export function getLastTopLevelStatement(
  str: string,
  splitTopLevelStatements: (_s: string) => string[]
): string | undefined {
  const parts = splitTopLevelStatements(str)
    .map((p: string) => p.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}

interface IntOperand {
  type: "int-operand";
  valueBig: bigint;
}

interface FloatOperand {
  type: "float-operand";
  floatValue: number;
  isFloat: true;
}

interface ObjectWithYield {
  __yield?: RuntimeValue;
}

/** Context for evaluateRhs */
export interface EvaluateRhsContext {
  rhs: string;
  envLocal: Env;
  interpret: InterpretFn;
  getLastTopLevelStatement_fn: (_s: string) => string | undefined;
}

// eslint-disable-next-line custom/no-unknown-param -- caught exception is unknown
function hasYieldProp(obj: unknown): obj is ObjectWithYield {
  // Use `== undefined` to check both null and undefined without using null literal
  return typeof obj === "object" && obj != undefined && "__yield" in obj;
}

// eslint-disable-next-line custom/no-unknown-param -- handles caught exception
function handleYieldSignal(e: unknown): RuntimeValue | undefined {
  if (!e || typeof e !== "object" || e === undefined || !("__yield" in e)) {
    return undefined;
  }
  if (!hasYieldProp(e)) return undefined;
  const yieldProp = e.__yield;
  if (typeof yieldProp !== "number") return undefined;
  if (Number.isInteger(yieldProp)) {
    return { type: "int-operand", valueBig: BigInt(yieldProp) };
  }
  return { type: "float-operand", floatValue: yieldProp, isFloat: true };
}

function makeOperandFromNumber(v: number): IntOperand | FloatOperand {
  if (Number.isInteger(v)) {
    return { type: "int-operand", valueBig: BigInt(v) };
  }
  return { type: "float-operand", floatValue: v, isFloat: true };
}

export function evaluateRhs(ctx: EvaluateRhsContext): RuntimeValue {
  const { rhs, envLocal, interpret, getLastTopLevelStatement_fn } = ctx;
  if (/^\s*\{[\s\S]*\}\s*$/.test(rhs)) {
    const inner = rhs.replace(/^\{\s*|\s*\}$/g, "");
    const lastInner = getLastTopLevelStatement_fn(inner);
    if (!lastInner) throw new Error("initializer cannot be empty block");
    if (/^let\b/.test(lastInner))
      throw new Error("initializer cannot contain declarations");
    try {
      const v = interpret(inner, {});
      return makeOperandFromNumber(v);
    } catch (e: unknown) {
      const yieldResult = handleYieldSignal(e);
      if (yieldResult !== undefined) return yieldResult;
      throw e;
    }
  }
  if (/^\s*let\b/.test(rhs) || /\{[^}]*\blet\b/.test(rhs))
    throw new Error("initializer cannot contain declarations");
  return evaluateReturningOperand(rhs, envLocal);
}

import { parseFnComponents } from "./parsing";

export function registerFunctionFromStmt(
  stmt: string,
  localEnv: Env,
  declared: Set<string>
): string | undefined {
  // support `fn name(<params>) => <expr>` or `fn name(<params>) { <stmts> }`
  const parsed = parseFnComponents(stmt);
  const { name, params, resultAnnotation, body, isBlock, trailingExpr } =
    parsed;
  if (declared.has(name)) throw new Error("duplicate declaration");

  // reserve name then attach closure env including the function itself
  declared.add(name);
  const registration: FnWrapperType = {
    type: "fn-wrapper",
    fn: { params, body, isBlock, resultAnnotation, closureEnv: undefined },
  };
  envSet(localEnv, name, registration);
  const fnObj = envGet(localEnv, name);
  if (!isFnWrapper(fnObj))
    throw new Error("internal error: fn registration failed");
  // attach closure env
  fnObj.fn.closureEnv = envClone(localEnv);

  return trailingExpr;
}

export function convertOperandToNumber(operand: RuntimeValue): number {
  if (isBoolOperand(operand)) return operand.boolValue ? 1 : 0;
  if (isIntOperand(operand)) return Number(operand.valueBig);
  if (typeof operand === "number") return operand;
  if (isFloatOperand(operand)) return operand.floatValue;
  throw new Error("cannot convert operand to number");
}

/**
 * interpretAll executes a mapping of namespace names to script bodies and
 * runs the script located at `mainNamespace` as an entry point.
 *
 * NOTE: This is a minimal stub. Future implementation will wire cross-namespace
 * references so scripts can import symbols from other namespaces.
 */
export function interpretAll(
  scripts: StringMap,
  mainNamespace: string
): number {
  // Forward to interpretAllWithNative with no native modules
  return interpretAllWithNative(scripts, {}, mainNamespace);
}

/**
 * Interpret scripts with support for native (host) modules provided as plain JS strings.
 * `nativeModules` maps namespace name to a native module body string. Native modules
 * may use a simple `export function name(...) { ... }` syntax which gets converted
 * into `exports.name = function (...) { ... }` at runtime. Native exported functions
 * are wrapped so they can be imported into scripts and called like normal functions.
 */
export function interpretAllWithNative(
  scripts: StringMap,
  nativeModules: StringMap,
  mainNamespace: string
): number {
  validateInterpretAllWithNativeInputs(scripts, nativeModules, mainNamespace);

  const normalizedScripts = normalizeNamespaceMap(scripts);
  const normalizedNative = normalizeNamespaceMap(nativeModules);

  if (!Object.prototype.hasOwnProperty.call(normalizedScripts, mainNamespace))
    throw new Error("main namespace not found");

  const interpFn = globalThis.interpret;
  if (typeof interpFn !== "function")
    throw new Error("internal error: interpret() is not available");

  // Prepare namespace registry and resolver that merges script and native exports
  const namespaceRegistry: NamespaceRegistry = {};
  const resolveNamespace = (nsName: string) =>
    resolveNamespaceToExports({
      nsName,
      normalizedScripts,
      normalizedNative,
      namespaceRegistry,
      interpFn,
    });

  // Provide resolver and registry to the main env
  const env: UnknownMap = {};
  env.__namespaces = normalizedScripts;
  env.__namespace_registry = namespaceRegistry;
  env.__resolve_namespace = resolveNamespace;

  return interpFn(normalizedScripts[mainNamespace], env);
}
