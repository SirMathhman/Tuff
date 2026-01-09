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
} from "../types";
import type { InterpretFn } from "../types";

export interface StringMap {
  [k: string]: string;
}

function validateInterpretAllWithNativeInputs(
  scripts: unknown,
  nativeModules: unknown,
  mainNamespace: unknown
): asserts scripts is StringMap {
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

export interface UnknownMap {
  [k: string]: RuntimeValue;
}

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
      interface FnObject {
        params: RuntimeValue[];
        body: string;
        isBlock: boolean;
        resultAnnotation: RuntimeValue;
        closureEnv: UnknownMap;
        nativeImpl: RuntimeValue;
      }
      interface FnWrapper {
        fn: FnObject;
      }
      // fn wrapper shape expected by interpreter
      const wrapper: FnWrapper = {
        fn: {
          params: [],
          body: "/* native */",
          isBlock: false,
          resultAnnotation: undefined,
          // Provide an empty object env so callers can clone it as a base
          closureEnv: {},
          nativeImpl: v,
        },
      };
      collectedExports[k] = wrapper;
    } else {
      collectedExports[k] = v;
    }
  }
}

export interface NamespaceRegistry {
  [k: string]: UnknownMap;
}

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
  valueBig: bigint;
}

interface FloatOperand {
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
      if (Number.isInteger(v)) {
        const operand: IntOperand = { valueBig: BigInt(v) };
        return operand;
      }
      const operand: FloatOperand = { floatValue: v, isFloat: true };
      return operand;
    } catch (e: unknown) {
      // Handle `yield` signal thrown from nested block execution. If a yield was
      // signaled, convert the numeric payload into an operand and return it.
      if (e && typeof e === "object" && e !== undefined && "__yield" in e) {
        const signal = e;
        function hasYieldProp(obj: unknown): obj is ObjectWithYield {
          return (
            typeof obj === "object" && obj !== undefined && "__yield" in obj
          );
        }
        if (hasYieldProp(signal)) {
          const yieldProp = signal.__yield;
          if (typeof yieldProp === "number") {
            const val = yieldProp;
            if (Number.isInteger(val)) {
              const operand: IntOperand = { valueBig: BigInt(val) };
              return operand;
            }
            const operand: FloatOperand = { floatValue: val, isFloat: true };
            return operand;
          }
        }
      }
      throw e;
    }
  }
  if (/^\s*let\b/.test(rhs) || /\{[^}]*\blet\b/.test(rhs))
    throw new Error("initializer cannot contain declarations");
  return evaluateReturningOperand(rhs, envLocal);
}

import { parseFnComponents } from "./parsing";

interface FnParamsObject {
  params: RuntimeValue;
  body: string;
  isBlock: boolean;
  resultAnnotation: RuntimeValue;
  closureEnv: RuntimeValue;
}

interface FnRegistration {
  fn: FnParamsObject;
}

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
  const registration: FnRegistration = {
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

export function convertOperandToNumber(operand: unknown): number {
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
