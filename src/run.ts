/**
 * Compile a string into JavaScript source that evaluates to a number
 */

interface VarDeclaration {
  mut: boolean;
  type?: string;
}

function replaceReads(input: string): string {
  const readI32Regex = /read<\s*I32\s*>\s*\(\s*\)/g;
  let out = input.replace(readI32Regex, "readI32()");
  const readBoolRegex = /read<\s*Bool\s*>\s*\(\s*\)/g;
  out = out.replace(readBoolRegex, "readBool()");
  return out;
}

interface ParseStructsResult {
  code: string;
  structs: Map<string, string[]>;
}

function parseStructs(input: string): ParseStructsResult {
  const structRegex =
    /struct\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\{\s*([^}]*)\s*\}/g;
  const structs = new Map<string, string[]>();
  let out = input;
  let m: RegExpExecArray | undefined;
  while (
    (m = structRegex.exec(input) as unknown as RegExpExecArray | undefined)
  ) {
    const name = m[1];
    const body = m[2];
    const fields = body
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((f) => {
        const fm = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*/.exec(f);
        return fm ? fm[1] : "";
      })
      .filter(Boolean);
    structs.set(name, fields);
    out = out.replace(m[0], "");
  }
  return { code: out, structs };
}

interface ParseFunctionsResult {
  code: string;
  error?: string;
  funcParamTypes?: Map<string, string[]>;
  funcParamNames?: Map<string, string[]>;
}

function makeTypeError(
  func: string,
  param: string,
  expected: string,
  actual: string
): string {
  return `(function(){ throw new Error("type mismatch in call to '${func}': parameter '${param}' expected ${expected} but got ${actual}"); })()`;
}

// Convert `fn name(params) : Type => { ... }` into JS function declarations
interface ParamListResult {
  names?: string[];
  types?: string[];
  duplicate?: string;
}

function parseParamList(params: string): ParamListResult {
  const pairs = params
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const pm =
        /^([A-Za-z_$][A-Za-z0-9_$]*)(?:\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*))?/.exec(
          p
        );
      return pm ? { name: pm[1], type: pm[2] } : { name: "", type: undefined };
    })
    .filter((x) => x.name);

  const names = pairs.map((p) => p.name);
  const types = pairs.map((p) => p.type || "unknown");

  // detect duplicate parameter names
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) return { duplicate: n };
    seen.add(n);
  }
  return { names, types };
}

function parseFunctions(input: string): ParseFunctionsResult {
  const fnRegex =
    /fn\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)\s*(?::\s*[A-Za-z_$][A-Za-z0-9_$]*)?\s*=>\s*\{([\s\S]*?)\}/g;
  let out = input;
  const names = new Set<string>();
  let m: RegExpExecArray | undefined;
  let resultParamTypes: Map<string, string[]> | undefined;
  let resultParamNames: Map<string, string[]> | undefined;
  while ((m = fnRegex.exec(input) as unknown as RegExpExecArray | undefined)) {
    const name = m[1];
    const params = m[2];
    const body = m[3];
    if (names.has(name)) {
      return {
        code: input,
        error: makeDuplicateError("function declaration", name),
      };
    }
    names.add(name);

    const parsed = parseParamList(params);
    if (parsed.duplicate) {
      return {
        code: input,
        error: `(function(){ throw new Error("duplicate parameter name '${parsed.duplicate}' in function '${name}'"); })()`,
      };
    }
    const paramNames = parsed.names || [];
    const paramTypes = parsed.types || [];

    const paramList = paramNames.join(", ");

    const transformedBody = body.replace(/\byield\b/g, "return");
    const replacement = `const ${name} = function(${paramList}) { ${transformedBody} };`;
    out = out.replace(m[0], replacement);
    if (!out) break; // safety
    // store param types and names for later checking
    if (!resultParamTypes) resultParamTypes = new Map<string, string[]>();
    if (!resultParamNames) resultParamNames = new Map<string, string[]>();
    resultParamTypes.set(name, paramTypes);
    resultParamNames.set(name, paramNames);
  }
  return {
    code: out,
    funcParamTypes: resultParamTypes,
    funcParamNames: resultParamNames,
  };
}

function inferTypeSimple(expr: string): string {
  const t = expr.trim();
  if (/^readI32\(\)$/.test(t)) return "I32";
  if (/^readBool\(\)$/.test(t)) return "Bool";
  if (/^\d+$/.test(t)) return "I32";
  if (/^(true|false)$/.test(t)) return "Bool";
  return "unknown";
}

function splitArgsTopLevel(argsStr: string): string[] {
  const args: string[] = [];
  let cur = "";
  let d = 0;
  for (let j = 0; j < argsStr.length; j++) {
    const ch = argsStr[j];
    if (ch === "(") {
      d++;
      cur += ch;
    } else if (ch === ")") {
      d--;
      cur += ch;
    } else if (ch === "," && d === 0) {
      args.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function getFunctionCallArgs(replaced: string, fname: string): string[][] {
  const results: string[][] = [];
  let searchStart = 0;
  while (true) {
    const idx = replaced.indexOf(fname + "(", searchStart);
    if (idx === -1) break;
    let i = idx + fname.length + 1;
    let depth = 1;
    const start = i;
    for (; i < replaced.length && depth > 0; i++) {
      const ch = replaced[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    if (depth !== 0) break;
    const argsStr = replaced.slice(start, i - 1).trim();
    results.push(splitArgsTopLevel(argsStr));
    searchStart = i;
  }
  return results;
}

function applyStringAndCtorTransforms(
  replaced: string,
  structs: Map<string, string[]>,
  decls: Map<string, VarDeclaration>
): string {
  // Convert char literals like 'a' -> ('a').charCodeAt(0) so they behave as numeric Char
  // Supports escaped chars such as '\n' via the capture
  replaced = replaced.replace(/'([^'\\]|\\.)'/g, "('$1').charCodeAt(0)");

  // Convert string literal indexing "foo"[0] -> ("foo").charCodeAt(0)
  replaced = replaced.replace(
    /"((?:[^"\\]|\\.)*)"\s*\[\s*(\d+)\s*\]/g,
    (_m, inner, idx) => `(${JSON.stringify(inner)}).charCodeAt(${idx})`
  );

  // Replace constructor calls like `Point { expr, expr }` with object literals
  for (const [name, fields] of structs.entries()) {
    const ctorRegex = new RegExp("\\b" + name + "\\s*\\{([^}]*)\\}", "g");
    replaced = replaced.replace(ctorRegex, (_m, inner) => {
      const args = inner
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      const pairs = fields.map((f, i) => `${f}: ${args[i] ?? "undefined"}`);
      return `({ ${pairs.join(", ")} })`;
    });
  }

  // Pointer support
  // Replace mutable address-of: `&mut x` -> {get:()=>x, set:(v)=>{x=v}}
  replaced = replaced.replace(
    /(?<!&)&\s*mut\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    "({get:()=>$1, set:(v)=>{ $1 = v }})"
  );

  // Replace pointer address-of: `&x` -> {get:()=>x, set:(v)=>{x=v}}
  replaced = replaced.replace(
    /(?<!&)&\s*([A-Za-z_$][A-Za-z0-9_$]*)/g,
    "({get:()=>$1, set:(v)=>{ $1 = v }})"
  );

  // Replace pointer assignment `*y = expr` -> `y.set(expr)`
  replaced = replaced.replace(
    /(?<![A-Za-z0-9_)\]"])\*\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([^;\n]+)/g,
    (_m, ident, rhs) => `${ident}.set(${rhs.trim()})`
  );

  // Replace deref use `*y` (unary) -> `y.get()` -- avoid matching multiplication by ensuring star is not binary
  replaced = replaced.replace(
    /(?<![A-Za-z0-9_)\]"])\*\s*([A-Za-z_$][A-Za-z0-9_$]*)/g,
    "$1.get()"
  );

  // If any variable is declared as `: &Str`, convert occurrences like `x[0]` to `x.charCodeAt(0)`
  for (const [name, info] of decls.entries()) {
    if (info.type === "&Str") {
      const idxRegex = new RegExp(
        "\\b" + name + "\\s*\\[\\s*(\\d+)\\s*\\]",
        "g"
      );
      replaced = replaced.replace(idxRegex, `${name}.charCodeAt($1)`);
    }
  }

  return replaced;
}

function checkFunctionCallTypes(
  replaced: string,
  fnParsed: ParseFunctionsResult
): string | undefined {
  if (!fnParsed.funcParamTypes) return undefined;

  for (const [fname, expectedTypes] of fnParsed.funcParamTypes.entries()) {
    const paramNames = fnParsed.funcParamNames?.get(fname) ?? [];
    const calls = getFunctionCallArgs(replaced, fname);
    for (const args of calls) {
      for (
        let iArg = 0;
        iArg < Math.min(expectedTypes.length, args.length);
        iArg++
      ) {
        const expected = expectedTypes[iArg];
        const actual = inferTypeSimple(args[iArg]);
        if (
          expected !== "unknown" &&
          actual !== "unknown" &&
          expected !== actual
        ) {
          const pname = paramNames[iArg] ?? `#${iArg + 1}`;
          return makeTypeError(fname, pname, expected, actual);
        }
      }
    }
  }

  return undefined;
}

interface ParseDeclarationsResult {
  decls: Map<string, VarDeclaration>;
  error?: string;
}

interface ParsedArrayType {
  inner: string;
  parts: string[];
}

function makeDuplicateError(kind: string, name: string): string {
  return `(function(){ throw new Error("duplicate ${kind} '${name}'"); })()`;
}

function splitArrayTypeInner(typeInner: string): string[] {
  return typeInner
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseArrayDeclaredSize(typeInner: string): number | undefined {
  const parts = splitArrayTypeInner(typeInner);
  if (parts.length < 2) return undefined;
  const maybeSize = parts[1];
  return /^\d+$/.test(maybeSize) ? parseInt(maybeSize, 10) : undefined;
}

function parseArrayRuntimeSize(typeInner: string): number | undefined {
  const parts = splitArrayTypeInner(typeInner);
  if (parts.length < 3) return undefined;
  const maybeSize = parts[2];
  return /^\d+$/.test(maybeSize) ? parseInt(maybeSize, 10) : undefined;
}

function defaultValForArrayElemType(t: string): string {
  const ty = t.trim();
  if (ty === "I32" || ty === "Bool" || ty === "Char") return "0";
  return "undefined";
}

function parseBracketArrayType(
  typeSpec: string | undefined
): ParsedArrayType | undefined {
  if (!typeSpec) return undefined;
  const t = typeSpec.trim();
  if (!t.startsWith("[")) return undefined;
  const inner = t.replace(/^\[|\]$/g, "");
  const parts = splitArrayTypeInner(inner);
  return { inner, parts };
}

function initializeArrayDecls(
  src: string,
  declsMap: Map<string, VarDeclaration>
): string {
  let out = src;
  for (const [name, info] of declsMap.entries()) {
    const parsed = parseBracketArrayType(info.type);
    if (!parsed) continue;
    const { inner, parts } = parsed;
    if (parts.length < 3) continue;
    const elemType = parts[0] || "";
    const runtimeSize = parseArrayRuntimeSize(inner);
    if (runtimeSize === undefined) continue;

    // If the declaration already has an initializer, skip
    const hasInitRe = new RegExp(
      "\\blet\\s+(?:mut\\s+)?" + name + "\\s*:\\s*\\[[^\\]]+\\]\\s*="
    );
    if (hasInitRe.test(out)) continue;

    const def = defaultValForArrayElemType(elemType);
    const fill = Array(runtimeSize).fill(def).join(", ");
    // Replace `let [mut] name : [..];` with `let [mut] name : [..] = [<fill>];`
    const declRe = new RegExp(
      "(\\blet\\s+(?:mut\\s+)?" + name + "\\s*:\\s*\\[[^\\]]+\\])\\s*;"
    );
    out = out.replace(declRe, (_m, declPart) => `${declPart} = [${fill}];`);
  }
  return out;
}

function skipWhitespace(input: string, start: number): number {
  let i = start;
  while (i < input.length && /\s/.test(input[i])) i++;
  return i;
}

function parseBracketedType(input: string, start: number): string | undefined {
  const close = input.indexOf("]", start + 1);
  if (close === -1) return undefined;
  return input.slice(start, close + 1).trim();
}

function parseSimpleType(input: string, start: number): string | undefined {
  let i = start;
  while (
    i < input.length &&
    input[i] !== "=" &&
    input[i] !== ";" &&
    input[i] !== "\n" &&
    input[i] !== "\r"
  ) {
    i++;
  }
  const raw = input.slice(start, i).trim();
  return raw || undefined;
}

function parseTypeAnnotationAfterName(
  input: string,
  start: number
): string | undefined {
  let i = skipWhitespace(input, start);
  if (input[i] !== ":") return undefined;
  i++;
  i = skipWhitespace(input, i);
  if (input[i] === "[") return parseBracketedType(input, i);
  return parseSimpleType(input, i);
}

function parseInitializerItems(initInner: string): string[] {
  return initInner
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function checkItemsLength(
  name: string,
  expected: number,
  initInner: string
): string | undefined {
  const items = parseInitializerItems(initInner);
  if (items.length !== expected) {
    return `(function(){ throw new Error("array initializer length mismatch for '${name}': expected ${expected} but got ${items.length}"); })()`;
  }
  return undefined;
}

function checkArrayInitializersInDecls(
  src: string,
  decls: Map<string, VarDeclaration>
): string | undefined {
  for (const [name, info] of decls.entries()) {
    const parsed = parseBracketArrayType(info.type);
    if (!parsed) continue;
    // parse bracket content split by semicolon: [Type; size; ...]
    const { inner } = parsed;
    const expected = parseArrayDeclaredSize(inner);
    if (expected === undefined) continue;
    // Manually find initializer bracket after the declaration to avoid regex pitfalls
    let startIdx = src.indexOf("let " + name);
    while (startIdx !== -1) {
      const eqIdx = src.indexOf("=", startIdx);
      if (eqIdx === -1) break;
      const brOpen = src.indexOf("[", eqIdx);
      if (brOpen === -1) break;
      // find closing bracket
      const brClose = src.indexOf("]", brOpen + 1);
      if (brClose === -1) break;
      const innerInit = src.slice(brOpen + 1, brClose);
      const maybeErr = checkItemsLength(name, expected, innerInit);
      if (maybeErr) return maybeErr;
      startIdx = src.indexOf("let " + name, brClose);
    }
  }
  return undefined;
}

function checkExplicitArrayDecls(src: string): string | undefined {
  const re =
    /\blet\s+(?:mut\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*\[([^\]]+)\]\s*=\s*\[([^\]]*)\]/g;
  let m: RegExpExecArray | undefined;
  while ((m = re.exec(src) as RegExpExecArray | undefined)) {
    const name = m[1];
    const typeInner = (m[2] || "").trim();
    const initInner = m[3] || "";
    const expected = parseArrayDeclaredSize(typeInner);
    if (expected === undefined) continue;
    const maybeErr = checkItemsLength(name, expected, initInner);
    if (maybeErr) return maybeErr;
  }
  return undefined;
}

function parseDeclarations(input: string): ParseDeclarationsResult {
  // Capture optional type annotations like `: I32`, `: &Str`, `: *mut I32`, or `: [I32; 0; 2]`.
  // We avoid a single "capture everything" regex because array types contain semicolons.
  const decls = new Map<string, VarDeclaration>();
  const declStartRe = /\blet\s+(mut\s+)?([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let m: RegExpExecArray | undefined;
  while (
    (m = declStartRe.exec(input) as unknown as RegExpExecArray | undefined)
  ) {
    const mut = !!m[1];
    const varName = m[2];
    if (decls.has(varName)) {
      return {
        decls,
        error: makeDuplicateError("variable declaration", varName),
      };
    }

    const afterNameIdx = (m.index ?? 0) + m[0].length;
    const type = parseTypeAnnotationAfterName(input, afterNameIdx);
    decls.set(varName, { mut, type });
  }
  return { decls };
}

function stripAnnotationsAndMut(replaced: string): string {
  // support Char, &Str and pointer annotations like *I32 or *mut I32
  replaced = replaced.replace(
    /:\s*(?:I32|Bool|Char|&Str|[*]I32|\*\s*mut\s*[A-Za-z_$][A-Za-z0-9_$]*)\b/g,
    ""
  );
  // strip bracketed array annotations like `[I32; 3; 3]`
  replaced = replaced.replace(/:\s*\[[^\]]*\]/g, "");
  replaced = replaced.replace(/\b(let|var|const)\s+mut\b/g, "$1");
  return replaced;
}

function checkImmutableAssignments(
  replaced: string,
  decls: Map<string, VarDeclaration>
): string | undefined {
  if (decls.size === 0) return undefined;
  const withoutDecls = replaced.replace(/\blet\b[^;]*;/g, "");
  for (const [name, info] of decls.entries()) {
    if (!info.mut) {
      const assignRegex = new RegExp("\\b" + name + "\\s*=");
      if (assignRegex.test(withoutDecls)) {
        return `(function(){ throw new Error("assignment to immutable variable '${name}'"); })()`;
      }
    }
  }
  return undefined;
}

function wrapStatements(code: string): string {
  const parts = code
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return "(0)";
  if (parts.length === 1) return parts[0];

  const last = parts.pop();
  const body = parts.join("; ");
  return `(function(){ ${body}; return (${last}); })()`;
}

export function compile(input: string): string {
  // Normalize input
  const trimmed = input.trim();

  // Extract and remove struct declarations first
  const structParsed = parseStructs(trimmed);
  let codeNoStructs = structParsed.code;
  const structs = structParsed.structs;

  // Transform `fn` declarations to JS functions before replacing reads
  const fnParsed = parseFunctions(codeNoStructs);
  if (fnParsed.error) return fnParsed.error;
  codeNoStructs = fnParsed.code;

  let replaced = replaceReads(codeNoStructs);

  const typeError = checkFunctionCallTypes(replaced, fnParsed);
  if (typeError) return typeError;

  const parsed = parseDeclarations(codeNoStructs);
  if (parsed.error) return parsed.error;
  const decls = parsed.decls;

  const arrInitErr = checkArrayInitializersInDecls(codeNoStructs, decls);
  if (arrInitErr) return arrInitErr;

  const arrExplicitErr = checkExplicitArrayDecls(codeNoStructs);
  if (arrExplicitErr) return arrExplicitErr;

  // Initialize arrays declared without an explicit initializer when the
  // type includes a runtime size (e.g., `[I32; 0; 2]`), creating an array
  // of the requested length filled with defaults so index assignments work.
  replaced = initializeArrayDecls(replaced, decls);

  const hasRead =
    replaced.indexOf("readI32()") !== -1 ||
    replaced.indexOf("readBool()") !== -1;

  replaced = stripAnnotationsAndMut(replaced);
  replaced = applyStringAndCtorTransforms(replaced, structs, decls);

  const assignError = checkImmutableAssignments(replaced, decls);
  if (assignError) return assignError;

  // If transformations produced a different single-expression (e.g., string literal indexing),
  // return it directly so it evaluates correctly instead of using the length fallback.
  if (replaced !== codeNoStructs) {
    if (/;|\b(let|const|var)\b|\n/.test(replaced)) {
      return wrapStatements(replaced);
    }
    return replaced;
  }

  if (hasRead) {
    if (/;|\b(let|const|var)\b|\n/.test(replaced)) {
      return wrapStatements(replaced);
    }

    return replaced;
  }

  // If the input contains multiple statements (semicolon or declarations),
  // wrap it in an IIFE that returns the last expression so it can be
  // evaluated as a single expression by `run`.
  if (/;|\b(let|const|var)\b|\n/.test(replaced)) {
    return wrapStatements(replaced);
  }

  // Fallback: return as an expression (e.g., length-based behavior for plain strings)
  return `(${trimmed.length})`;
}

/**
 * run - takes a string and returns a number
 * Implementation: compile the input to JS, eval it, and return the result.
 */
export function run(input: string, stdin: string = ""): number {
  // Call the exported `compile` to allow runtime spies/mocks to intercept it.
  // Use NodeJS.Module type to satisfy ESLint's no-explicit-any.
  const compiledExpr = (exports as NodeJS.Module["exports"]).compile(input);

  // Wrap the compiled expression in an IIFE so we can inject `stdin` into
  // the evaluation scope. JSON.stringify is used to safely embed the stdin
  // string literal. We also provide `readI32` and `readBool` helpers that
  // consume tokens from `stdin` (split on whitespace) so expressions like
  // "read<I32>() + read<Bool>()" work as expected.
  const code = `(function(){ const stdin = ${JSON.stringify(
    stdin
  )}; const args = stdin.trim() ? stdin.trim().split(/\\s+/) : []; let __readIndex = 0; function readI32(){ return parseInt(args[__readIndex++], 10); } function readBool(){ const val = args[__readIndex++]; return val === 'true' ? 1 : 0; } return (${compiledExpr}); })()`;

  const result = eval(code);
  return Number(result);
}
