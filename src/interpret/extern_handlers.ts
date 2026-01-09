/**
 * Handlers for extern declarations extracted from interpretBlockInternal.
 */
import { Env, envGet, envSet } from "../env";
import {
  isPlainObject,
  isFnWrapper,
  getProp,
  type RuntimeValue,
  type FnWrapper,
} from "../types";

function parseExternFnSignature(stmt: string) {
  const m = stmt.match(
    /^extern\s+fn\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*(?:\s*:\s*([^;]+))?\s*;?$/
  );
  if (!m) throw new Error("invalid extern fn declaration");
  const name = m[1];
  const paramsStr = m[2].trim();
  const params =
    paramsStr === ""
      ? []
      : paramsStr.split(",").map((p) => {
          const part = p.trim();
          const parts = part.split(":");
          const pname = parts[0].trim();
          const pann = parts[1] ? parts.slice(1).join(":").trim() : undefined;
          return { name: pname, annotation: pann };
        });
  const resultAnnotation = m[3] ? m[3].trim() : undefined;
  return { name, params, resultAnnotation };
}

/** Context for tryMergeExternSignature */
interface MergeExternContext {
  localEnv: Env;
  name: string;
  params: RuntimeValue;
  resultAnnotation: string | undefined;
}

function tryMergeExternSignature(ctx: MergeExternContext): boolean {
  const { localEnv, name, params, resultAnnotation } = ctx;
  const existing = envGet(localEnv, name);
  if (!(isPlainObject(existing) && isFnWrapper(existing))) return false;

  const existingBody = getProp(existing.fn, "body");
  const existingIsBlock = getProp(existing.fn, "isBlock");
  const existingClosureEnv = getProp(existing.fn, "closureEnv");
  const existingNative = getProp(existing.fn, "nativeImpl");

  type FnObject = {
    [k: string]: RuntimeValue;
  };

  const newFn: FnObject = {
    params,
    body: typeof existingBody === "string" ? existingBody : "/* extern */",
    isBlock: existingIsBlock === true,
    resultAnnotation:
      typeof resultAnnotation === "string"
        ? resultAnnotation
        : getProp(existing.fn, "resultAnnotation"),
    closureEnv: existingClosureEnv ? existingClosureEnv : undefined,
  };
  if (typeof existingNative === "function") newFn.nativeImpl = existingNative;

  const wrapper: FnWrapper = { type: "fn-wrapper", fn: newFn };
  envSet(localEnv, name, wrapper);
  return true;
}

/**
 * Handle extern fn declaration
 * Returns true if the statement was handled
 */
export function handleExternFn(
  stmt: string,
  localEnv: Env,
  declared: Set<string>
): boolean {
  if (!/^extern\s+fn\b/.test(stmt)) return false;

  // extern function declaration: `extern fn name(params) : Type` (no body)
  const { name, params, resultAnnotation } = parseExternFnSignature(stmt);

  // If the symbol was already introduced (e.g., via import from a native
  // module), merge the extern signature into the existing binding so that
  // native wrappers gain parameter metadata (e.g., a leading `this`).
  if (declared.has(name)) {
    tryMergeExternSignature({ localEnv, name, params, resultAnnotation });
    return true;
  }

  declared.add(name);
  // register placeholder fn wrapper (no nativeImpl yet)
  envSet(localEnv, name, {
    fn: {
      params,
      body: "/* extern */",
      isBlock: false,
      resultAnnotation,
      closureEnv: undefined,
    },
  });
  return true;
}

/**
 * Handle extern let declaration
 * Returns true if the statement was handled
 */
export function handleExternLet(
  stmt: string,
  localEnv: Env,
  declared: Set<string>
): boolean {
  if (!/^extern\s+let\b/.test(stmt)) return false;

  const m = stmt.match(
    /^extern\s+let\s+([a-zA-Z_]\w*)(?:\s*:\s*([^;]+))?\s*;?$/
  );
  if (!m) throw new Error("invalid extern let declaration");
  const name = m[1];
  const annotation = m[2] ? m[2].trim() : undefined;
  if (declared.has(name)) {
    // already declared by import — no-op
    return true;
  }
  declared.add(name);
  envSet(localEnv, name, {
    uninitialized: true,
    annotation,
    parsedAnnotation: undefined,
    literalAnnotation: false,
    mutable: false,
    value: undefined,
  });
  return true;
}

/**
 * Context for handleImportStatement
 */
export interface ImportStatementContext {
  stmt: string;
  localEnv: Env;
  env: Env;
  declared: Set<string>;
}

/**
 * Handle import statement: `from <ns> use { a, b }`
 * Returns true if the statement was handled
 */
export function handleImportStatement(ctx: ImportStatementContext): boolean {
  const { stmt, localEnv, env, declared } = ctx;
  if (!/^extern\b/.test(stmt) && !/^from\b/.test(stmt)) return false;

  let importStmt = stmt;
  if (/^extern\b/.test(importStmt))
    importStmt = importStmt.replace(/^extern\s+/, "");

  const importRE =
    /from\s+([a-zA-Z_]\w*(?:::[a-zA-Z_]\w*)*)\s+use\s*\{\s*([a-zA-Z_]\w*(?:\s*,\s*[a-zA-Z_]\w*)*)\s*\}/;
  let m = importStmt.match(importRE);
  if (!m) {
    const idx = importStmt.indexOf("from");
    if (idx !== -1) m = importStmt.slice(idx).match(importRE);
  }
  if (!m) throw new Error("invalid import syntax");
  const nsName = m[1];
  const names = m[2].split(",").map((x) => x.trim());
  const resolver =
    envGet(env, "__resolve_namespace") ||
    envGet(localEnv, "__resolve_namespace");
  if (typeof resolver !== "function")
    throw new Error("namespace resolver not available");
  const nsExports = resolver(nsName);
  if (!isPlainObject(nsExports))
    throw new Error("namespace resolver returned invalid exports");
  for (const name of names) {
    if (!Object.prototype.hasOwnProperty.call(nsExports, name))
      throw new Error("symbol not found in namespace");
    if (declared.has(name)) throw new Error("duplicate declaration");
    declared.add(name);
    envSet(localEnv, name, nsExports[name]);
  }
  return true;
}
