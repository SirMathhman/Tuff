import { evaluateReturningOperand } from "../eval";
import { Env, envSet, envGet, envClone } from "../env";
import {
  isBoolOperand,
  isFloatOperand,
  isIntOperand,
  isFnWrapper,
  isPlainObject,
  toErrorMessage,
} from "../types";
import type { InterpretFn } from "../types";

export function getLastTopLevelStatement(
  str: string,
  splitTopLevelStatements: (_s: string) => string[]
): string | undefined {
  const parts = splitTopLevelStatements(str)
    .map((p: string) => p.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}

export function evaluateRhs(
  rhs: string,
  envLocal: Env,
  interpret: InterpretFn,
  getLastTopLevelStatement_fn: (_s: string) => string | undefined
): unknown {
  if (/^\s*\{[\s\S]*\}\s*$/.test(rhs)) {
    const inner = rhs.replace(/^\{\s*|\s*\}$/g, "");
    const lastInner = getLastTopLevelStatement_fn(inner);
    if (!lastInner) throw new Error("initializer cannot be empty block");
    if (/^let\b/.test(lastInner))
      throw new Error("initializer cannot contain declarations");
    try {
      const v = interpret(inner, {});
      if (Number.isInteger(v)) return { valueBig: BigInt(v) };
      return { floatValue: v, isFloat: true };
    } catch (e: unknown) {
      // Handle `yield` signal thrown from nested block execution. If a yield was
      // signaled, convert the numeric payload into an operand and return it.
      if (
        e &&
        typeof e === "object" &&
        "__yield" in e &&
        typeof e.__yield === "number"
      ) {
        const val = e.__yield;
        if (Number.isInteger(val)) return { valueBig: BigInt(val) };
        return { floatValue: val, isFloat: true };
      }
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
  envSet(localEnv, name, {
    fn: { params, body, isBlock, resultAnnotation, closureEnv: undefined },
  });
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
  scripts: { [k: string]: string },
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
  scripts: { [k: string]: string },
  nativeModules: { [k: string]: string },
  mainNamespace: string
): number {
  if (!scripts || typeof scripts !== "object")
    throw new Error("scripts must be an object");
  if (!nativeModules || typeof nativeModules !== "object")
    throw new Error("nativeModules must be a string");
  if (typeof mainNamespace !== "string")
    throw new Error("mainNamespace must be a string");

  // Normalize script and native keys (replace comma-based computed keys with ::)
  const normalizedScripts: { [k: string]: string } = {};
  for (const k of Object.keys(scripts))
    normalizedScripts[k.replace(/,/g, "::")] = scripts[k];
  const normalizedNative: { [k: string]: string } = {};
  for (const k of Object.keys(nativeModules))
    normalizedNative[k.replace(/,/g, "::")] = nativeModules[k];

  if (!Object.prototype.hasOwnProperty.call(normalizedScripts, mainNamespace))
    throw new Error("main namespace not found");

  const interpFn = globalThis.interpret;
  if (typeof interpFn !== "function")
    throw new Error("internal error: interpret() is not available");

  // Helper to evaluate a native module string into an exports object
  const evaluateNativeModule = (code: string) => {
    const exports: { [k: string]: unknown } = {};
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

    try {
      const fn = new Function("exports", transformed);
      fn(exports);
    } catch (e) {
      throw new Error(`failed to evaluate native module: ${toErrorMessage(e)}`);
    }
    return exports;
  };

  // Prepare namespace registry and resolver that merges script and native exports
  const namespaceRegistry: { [k: string]: { [k: string]: unknown } } = {};
  const resolveNamespace = (nsName: string) => {
    if (
      !Object.prototype.hasOwnProperty.call(normalizedScripts, nsName) &&
      !Object.prototype.hasOwnProperty.call(normalizedNative, nsName)
    )
      throw new Error("namespace not found");
    if (!Object.prototype.hasOwnProperty.call(namespaceRegistry, nsName)) {
      const nsEnv: { [k: string]: unknown } = {};
      // Exports object where `out` declarations will register their symbols
      nsEnv.__exports = {};
      // Run script-backed module first if present
      if (Object.prototype.hasOwnProperty.call(normalizedScripts, nsName)) {
        interpFn(normalizedScripts[nsName], nsEnv);
      }
      // Merge native module exports (native takes precedence)
      // Collect exported symbols from script-executed module (if any)
      const collectedExports: { [k: string]: unknown } = {};
      if (isPlainObject(nsEnv.__exports)) {
        for (const [kk, vv] of Object.entries(nsEnv.__exports))
          collectedExports[kk] = vv;
      }

      // Merge native module exports (native takes precedence)
      if (Object.prototype.hasOwnProperty.call(normalizedNative, nsName)) {
        const nativeExports = evaluateNativeModule(normalizedNative[nsName]);
        for (const [k, v] of Object.entries(nativeExports)) {
          if (typeof v === "function") {
            // fn wrapper shape expected by interpreter
            const wrapper = {
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

      // nsEnv.__exports is guaranteed to be a plain object; use the collected map
      namespaceRegistry[nsName] = collectedExports;
    }
    return namespaceRegistry[nsName];
  };

  // Provide resolver and registry to the main env
  const env: { [k: string]: unknown } = {};
  env.__namespaces = normalizedScripts;
  env.__namespace_registry = namespaceRegistry;
  env.__resolve_namespace = resolveNamespace;

  return interpFn(normalizedScripts[mainNamespace], env);
}
