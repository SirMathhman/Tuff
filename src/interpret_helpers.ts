import { parseOperand, parseOperandAt } from "./parser";
import { evaluateReturningOperand, checkRange } from "./eval";
import { Env, envSet, envClone, envGet } from "./env";
import {
  isPlainObject,
  isBoolOperand,
  isFloatOperand,
  isIntOperand,
  isPointer,
  isFnWrapper,
  getProp,
  hasKindBits,
  hasPtrIsBool,
  toErrorMessage,
} from "./types";
import type { InterpretFn } from "./types";
/* eslint-disable max-lines */

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

export function checkAnnMatchesRhs(ann: unknown, rhsOperand: unknown) {
  if (!isIntOperand(ann))
    throw new Error("annotation must be integer literal with suffix");
  if (!isIntOperand(rhsOperand))
    throw new Error(
      "initializer must be integer-like to match annotated literal"
    );
  if (ann.valueBig !== rhsOperand.valueBig)
    throw new Error("annotation value does not match initializer");
  if (hasKindBits(rhsOperand)) {
    if (
      !hasKindBits(ann) ||
      ann.kind !== rhsOperand.kind ||
      ann.bits !== rhsOperand.bits
    )
      throw new Error("annotation kind/bits do not match initializer");
  }
}

export function validateTypeOnly(
  kind: string,
  bits: number,
  rhsOperand: unknown
) {
  if (!isIntOperand(rhsOperand))
    throw new Error("annotation must be integer type matching initializer");
  if (hasKindBits(rhsOperand)) {
    if (rhsOperand.kind !== kind || rhsOperand.bits !== bits)
      throw new Error("annotation kind/bits do not match initializer");
  } else {
    checkRange(kind, bits, rhsOperand.valueBig);
  }
}

export function validateAnnotation(
  annotation: string | undefined | unknown,
  rhsOperand: unknown
) {
  if (!annotation) return;

  // pointer annotation: *<inner>
  if (typeof annotation === "string" && /^\s*\*/.test(annotation)) {
    const inner = annotation.replace(/^\s*\*/g, "").trim();
    if (!isPointer(rhsOperand))
      throw new Error("annotation requires pointer initializer");
    // inner can be type-only like I32, Bool, or a literal operand
    const parsedType = (function (s: string) {
      const t = s.match(/^\s*([uUiI])\s*(\d+)\s*$/);
      if (!t) return undefined;
      return {
        kind: t[1] === "u" || t[1] === "U" ? "u" : "i",
        bits: Number(t[2]),
      };
    })(inner);
    if (parsedType) {
      validateTypeOnly(parsedType.kind, parsedType.bits, rhsOperand);
      return;
    }
    if (/^\s*bool\s*$/i.test(inner)) {
      if (!hasPtrIsBool(rhsOperand) || rhsOperand.ptrIsBool !== true)
        throw new Error("annotation Pointer Bool requires boolean initializer");
      return;
    }
    // otherwise inner might be a literal like 1I32
    const ann = parseOperand(inner);
    if (!ann) throw new Error("invalid annotation in let");
    // ensure pointer's pointed literal matches
    checkAnnMatchesRhs(ann, {
      valueBig: getProp(rhsOperand, "valueBig"),
      kind: getProp(rhsOperand, "kind"),
      bits: getProp(rhsOperand, "bits"),
    });
    return;
  }

  // If annotation is already a parsed operand object (from parsedAnnotation), use it
  if (typeof annotation !== "string") {
    checkAnnMatchesRhs(annotation, rhsOperand);
    return;
  }

  const typeOnly = annotation.match(/^\s*([uUiI])\s*(\d+)\s*$/);
  if (typeOnly) {
    const kind = typeOnly[1] === "u" || typeOnly[1] === "U" ? "u" : "i";
    const bits = Number(typeOnly[2]);
    validateTypeOnly(kind, bits, rhsOperand);
  } else if (/^\s*bool\s*$/i.test(annotation)) {
    if (!isBoolOperand(rhsOperand))
      throw new Error("annotation Bool requires boolean initializer");
  } else {
    const ann = parseOperand(annotation);
    if (!ann) throw new Error("invalid annotation in let");
    checkAnnMatchesRhs(ann, rhsOperand);
  }
}

export function findMatchingParen(
  str: string,
  startIdx: number,
  openChar = "(",
  closeChar = ")"
) {
  let depth = 0;
  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i];
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export { parseOperand };

export function extractAssignmentParts(stmt: string):
  | {
      isDeref: boolean;
      isDeclOnly: boolean;
      name: string;
      op: string | undefined;
      rhs: string;
      isThisField?: boolean;
      fieldName?: string;
    }
  | undefined {
  // Try this.field compound assignment: this.x += 1
  let m = stmt.match(/^this\s*\.\s*([a-zA-Z_]\w*)\s*([+\-*/%])=\s*(.+)$/);
  if (m) {
    return {
      isDeref: false,
      isDeclOnly: false,
      name: m[1],
      op: m[2],
      rhs: m[3].trim(),
      isThisField: true,
      fieldName: m[1],
    };
  }

  // Try this.field assignment: this.x = ...
  m = stmt.match(/^this\s*\.\s*([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (m) {
    return {
      isDeref: false,
      isDeclOnly: false,
      name: m[1],
      op: undefined,
      rhs: m[2].trim(),
      isThisField: true,
      fieldName: m[1],
    };
  }

  // Try deref compound assignment: *x += 1
  m = stmt.match(/^\*\s*([a-zA-Z_]\w*)\s*([+\-*/%])=\s*(.+)$/);
  if (m) {
    return {
      isDeref: true,
      isDeclOnly: false,
      name: m[1],
      op: m[2],
      rhs: m[3].trim(),
    };
  }

  // Try compound assignment: x += 1
  m = stmt.match(/^([a-zA-Z_]\w*)\s*([+\-*/%])=\s*(.+)$/);
  if (m) {
    return {
      isDeref: false,
      isDeclOnly: false,
      name: m[1],
      op: m[2],
      rhs: m[3].trim(),
    };
  }

  // Try deref assignment: *x = ...
  m = stmt.match(/^\*\s*([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (m) {
    return {
      isDeref: true,
      isDeclOnly: false,
      name: m[1],
      op: undefined,
      rhs: m[2].trim(),
    };
  }

  // Try simple assignment: x = ...
  m = stmt.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (m) {
    return {
      isDeref: false,
      isDeclOnly: false,
      name: m[1],
      op: undefined,
      rhs: m[2].trim(),
    };
  }

  return undefined;
}

export function expandParensAndBraces(
  s: string,
  env: Env,
  interpret: InterpretFn,
  getLastTopLevelStatement_fn: (_s: string) => string | undefined
): string {
  if (!s.includes("(") && !s.includes("{")) return s;

  let expr = s;
  const parenRegex = /\([^()]*\)|\{[^{}]*\}/;
  const placeholders: string[] = [];

  const replaceWithPlaceholder = (kind: string, matched: string) => {
    const ph = `__${kind}_PLACEHOLDER_${placeholders.length}__`;
    placeholders.push(matched);
    expr = expr.replace(matched, ph);
    return ph;
  };

  while (parenRegex.test(expr)) {
    const m = expr.match(parenRegex)![0];
    const inner = m.slice(1, -1);
    const idx = expr.indexOf(m);
    const prefix = expr.slice(0, idx);

    // Skip match bodies; they are handled later by expression evaluator
    if (m[0] === "{" && /\bmatch\b(?:\s*\([^()]*\))?\s*$/.test(prefix)) {
      replaceWithPlaceholder("MATCH_BLOCK", m);
      continue;
    }

    // Skip function bodies - they should not be evaluated at parse time. Detect a
    // function body by checking for an arrow (`=>`) right before the brace.
    if (m[0] === "{" && /=>\s*$/.test(prefix)) {
      replaceWithPlaceholder("FN_BODY", m);
      continue;
    }

    // Skip parameter lists belonging to a function header (e.g., `fn name(...)`)
    // to avoid prematurely evaluating them as grouped expressions.
    if (m[0] === "(" && /\bfn\s+[a-zA-Z_]\w*\s*$/.test(prefix)) {
      replaceWithPlaceholder("FN_PARAMS", m);
      continue;
    }

    // Disallow declarations inside initializers
    if (/\blet\s+[a-zA-Z_]\w*\s*=\s*$/.test(prefix)) {
      const last = getLastTopLevelStatement_fn(inner);
      if (!last || /^let\b/.test(last))
        throw new Error("initializer cannot contain declarations");
    }

    // IMPORTANT: `{ ... }` is a lexically-scoped block. Evaluate it by passing
    // the braces through to `interpret()` so it can apply block scoping rules.
    // Interpreting only the inner text would execute it as a statement sequence
    // in the outer env, leaking declarations.
    const v = m[0] === "{" ? interpret(m, env) : interpret(inner, env);
    const after = expr.slice(idx + m.length);
    const afterMatch = after.match(/\s*([^\s])/);
    const afterNon = afterMatch ? afterMatch[1] : undefined;
    let replacement = String(v);
    if (m[0] === "{" && afterNon && !/[+\-*/%)}\]]/.test(afterNon)) {
      replacement = replacement + ";";
    }
    expr = expr.replace(m, replacement);
  }

  // Restore match placeholders
  for (let i = 0; i < placeholders.length; i++) {
    expr = expr.replace(`__MATCH_BLOCK_PLACEHOLDER_${i}__`, placeholders[i]);
  }

  return expr;
}

export function parseExpressionTokens(
  s: string
): { op?: string; operand?: unknown }[] {
  const exprTokens: { op?: string; operand?: unknown }[] = [];
  let idx = 0;
  const len = s.length;

  function skipSpacesLocal() {
    while (idx < len && s[idx] === " ") idx++;
  }

  skipSpacesLocal();
  const first = parseOperandAt(s, idx);
  if (first) {
    exprTokens.push({ operand: first.operand });
    idx += first.len;
    skipSpacesLocal();
    while (idx < len) {
      skipSpacesLocal();
      let op: string | undefined = undefined;
      if (s.startsWith("||", idx)) {
        op = "||";
        idx += 2;
      } else if (s.startsWith("&&", idx)) {
        op = "&&";
        idx += 2;
      } else {
        const ch = s[idx];
        if (ch !== "+" && ch !== "-" && ch !== "*" && ch !== "/" && ch !== "%")
          break;
        op = ch;
        idx++;
      }
      skipSpacesLocal();
      const nxt = parseOperandAt(s, idx);
      if (!nxt) throw new Error("invalid operand after operator");
      exprTokens.push({ op, operand: nxt.operand });
      idx += nxt.len;
      skipSpacesLocal();
    }
  }
  return exprTokens;
}

export function parseFnComponents(stmt: string) {
  const m = stmt.match(/^fn\s+([a-zA-Z_]\w*)/);
  if (!m) throw new Error("invalid fn declaration");
  const name = m[1];

  // find parameter parens
  const start = stmt.indexOf("(");
  if (start === -1) throw new Error("invalid fn syntax");
  const endIdx = findMatchingParen(stmt, start);
  if (endIdx === -1) throw new Error("unbalanced parentheses in fn");
  const paramsRaw = stmt.slice(start + 1, endIdx).trim();
  const params = paramsRaw.length
    ? paramsRaw.split(",").map((p) => {
        const parts = p.split(":");
        const name = parts[0].trim();
        const ann = parts[1] ? parts.slice(1).join(":").trim() : undefined;
        return { name, annotation: ann };
      })
    : [];

  let after = stmt.slice(endIdx + 1).trim();
  let body: string = "";
  let isBlock = false;
  // optional result annotation: `: <annotation>` before `=>` or `{`
  let resultAnnotation: string | undefined = undefined;
  let rest = after;
  if (rest.startsWith(":")) {
    const afterAnn = rest.slice(1).trimStart();
    const idxArrow = afterAnn.indexOf("=>");
    const idxBrace = afterAnn.indexOf("{");
    let pos = -1;
    if (idxArrow !== -1 && (idxBrace === -1 || idxArrow < idxBrace))
      pos = idxArrow;
    else if (idxBrace !== -1) pos = idxBrace;
    if (pos === -1) throw new Error("invalid fn result annotation");
    resultAnnotation = afterAnn.slice(0, pos).trim();
    rest = afterAnn.slice(pos).trimStart();
  }

  let trailingExpr: string | undefined = undefined;

  // helper to extract a braced body and any trailing expression
  function extractBracedBody(startSearchIdx: number) {
    const bStart = stmt.indexOf("{", startSearchIdx);
    const bEnd = findMatchingParen(stmt, bStart, "{", "}");
    if (bEnd === -1) throw new Error("unbalanced braces in fn");
    body = stmt.slice(bStart, bEnd + 1);
    isBlock = true;
    if (bEnd < stmt.length - 1) {
      trailingExpr = stmt.slice(bEnd + 1).trim();
      if (trailingExpr === "") trailingExpr = undefined;
    }
  }

  if (rest.startsWith("=>")) {
    const afterArrow = rest.slice(2).trim();
    // arrow-body may itself start with a braced block; handle trailing exprs after the block
    if (afterArrow.startsWith("{")) {
      extractBracedBody(endIdx + 1);
    } else {
      body = afterArrow;
      if (!body) throw new Error("missing fn body");
    }
  } else if (rest.startsWith("{")) {
    extractBracedBody(endIdx + 1);
  } else {
    throw new Error("invalid fn body");
  }

  return {
    name,
    params,
    resultAnnotation,
    body,
    isBlock,
    trailingExpr,
    endIdx,
  };
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
  envSet(localEnv, name, {
    fn: { params, body, isBlock, resultAnnotation, closureEnv: undefined },
  });
  const fnObj = envGet(localEnv, name);
  if (!isFnWrapper(fnObj))
    throw new Error("internal error: fn registration failed");
  // eslint-disable-next-line no-restricted-syntax
  (fnObj.fn as { closureEnv: Env | undefined }).closureEnv = envClone(localEnv);

  return trailingExpr;
}

export function convertOperandToNumber(operand: unknown): number {
  if (isBoolOperand(operand)) return operand.boolValue ? 1 : 0;
  if (isIntOperand(operand)) return Number(operand.valueBig);
  if (typeof operand === "number") return operand;
  if (isFloatOperand(operand)) return operand.floatValue;
  throw new Error("cannot convert operand to number");
}

export function parseStructDef(stmt: string): {
  name: string;
  fields: Array<{ name: string; annotation: string }>;
  endPos: number;
} {
  // syntax: struct Name { field1 : Type1; field2 : Type2; ... }
  const m = stmt.match(/^struct\s+([a-zA-Z_]\w*)\s*\{/);
  if (!m) throw new Error("invalid struct syntax");

  const name = m[1];
  const braceStart = stmt.indexOf("{");
  const braceEnd = findMatchingParen(stmt, braceStart, "{", "}");
  if (braceEnd === -1)
    throw new Error("unbalanced braces in struct definition");

  const fieldsStr = stmt.slice(braceStart + 1, braceEnd).trim();

  if (!fieldsStr) {
    // empty struct
    return { name, fields: [], endPos: braceEnd + 1 };
  }

  // Split fields by comma (respecting nesting)
  const fieldParts: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of fieldsStr) {
    if (ch === "{" || ch === "(") depth++;
    else if (ch === "}" || ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      if (current.trim()) fieldParts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) fieldParts.push(current.trim());

  const fields: Array<{ name: string; annotation: string }> = [];
  for (const fieldPart of fieldParts) {
    // Each field should be: name : annotation
    const fm = fieldPart.match(/^([a-zA-Z_]\w*)\s*:\s*(.+)$/);
    if (!fm) throw new Error("invalid field definition");
    fields.push({ name: fm[1], annotation: fm[2].trim() });
  }

  return { name, fields, endPos: braceEnd + 1 };
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
    throw new Error("nativeModules must be an object");
  if (typeof mainNamespace !== "string")
    throw new Error("mainNamespace must be a string");

  // Normalize script and native keys (replace comma-based computed keys with ::)
  const normalizedScripts: { [k: string]: string } = {};
  for (const k of Object.keys(scripts)) normalizedScripts[k.replace(/,/g, "::")] = scripts[k];
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
    const transformed = code.replace(/(^|\n)\s*export\s+function\s+([a-zA-Z_]\w*)\s*\(/g, (m, p1, name) => {
      return `${p1}exports.${name} = function (`;
    });
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
    if (!Object.prototype.hasOwnProperty.call(normalizedScripts, nsName) && !Object.prototype.hasOwnProperty.call(normalizedNative, nsName))
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
        for (const [kk, vv] of Object.entries(nsEnv.__exports)) collectedExports[kk] = vv;
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
