import { makeDuplicateError, makeTypeError } from "./errors";
import type { ParamListResult, ParseFunctionsResult } from "./types";

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

export function findMatching(
  input: string,
  start: number,
  open: string = "{",
  close: string = "}"
): number | undefined {
  let i = start;
  let depth = 1;
  for (; i < input.length && depth > 0; i++) {
    const ch = input[i];
    if (ch === open) depth++;
    else if (ch === close) depth--;
  }
  return depth === 0 ? i : undefined;
}

function sanitizeThisParam(paramList: string, body: string): { safeParamList: string; safeBody: string } {
  const safeParamList = paramList
    .split(",")
    .map((p) => (p.trim() === "this" ? "__this" : p.trim()))
    .filter(Boolean)
    .join(", ");
  const safeBody = body.replace(/\bthis\b/g, "__this");
  return { safeParamList, safeBody };
}

// eslint-disable-next-line complexity
function findStmtEndTopLevel(input: string, start: number): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle || inDouble) continue;

    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === ";" && depth === 0) return i;
  }
  return input.length;
}

// eslint-disable-next-line max-lines-per-function
export function parseFunctions(input: string): ParseFunctionsResult {
  // Use a header regex to find function starts and then scan for the matching
  // closing brace using helper `findMatchingBrace` so function remains small.
  const headerRe =
    /fn\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)\s*(?::\s*[A-Za-z_$][A-Za-z0-9_$]*)?\s*=>\s*/g;
  let out = "";
  let lastIndex = 0;
  const names = new Set<string>();
  let resultParamTypes: Map<string, string[]> | undefined;
  let resultParamNames: Map<string, string[]> | undefined;
  let m: RegExpExecArray | undefined;

  while ((m = headerRe.exec(input) as RegExpExecArray | undefined)) {
    const name = m[1];
    const params = m[2];
    const headerStart = m.index ?? 0;

    // Decide between `{ ... }` body and expression body `=> expr;`.
    let p = headerRe.lastIndex;
    while (p < input.length && /\s/.test(input[p])) p++;

    let body: string;
    let isExprBody = false;
    let nextIndex: number;
    if (input[p] === "{") {
      const braceOpen = p;
      const matching = findMatching(input, braceOpen + 1, "{", "}");
      if (matching === undefined) {
        // Unbalanced braces; return original input so we surface a sensible error later
        return { code: input };
      }

      const k = matching;
      body = input.slice(braceOpen + 1, k - 1);
      nextIndex = k;
    } else {
      const stmtEnd = findStmtEndTopLevel(input, p);
      body = input.slice(p, stmtEnd).trim();
      isExprBody = true;
      nextIndex = stmtEnd < input.length ? stmtEnd + 1 : stmtEnd;
    }

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

    const replacement = isExprBody
      ? buildFunctionReplacementExpr(name, paramList, body)
      : buildFunctionReplacement(name, paramList, body);
    out += input.slice(lastIndex, headerStart) + replacement;
    lastIndex = nextIndex;

    ensureParamMaps();
    resultParamTypes!.set(name, paramTypes);
    resultParamNames!.set(name, paramNames);
  }

  function ensureParamMaps(): void {
    if (!resultParamTypes) resultParamTypes = new Map<string, string[]>();
    if (!resultParamNames) resultParamNames = new Map<string, string[]>();
  }

  out += input.slice(lastIndex);

  return {
    code: out,
    funcParamTypes: resultParamTypes,
    funcParamNames: resultParamNames,
  };
}

function buildFunctionReplacement(
  name: string,
  paramList: string,
  body: string
): string {
  const transformedBody = body.replace(/\byield\b/g, "return");
  const { safeParamList, safeBody } = sanitizeThisParam(paramList, transformedBody);
  return `const ${name} = function(${safeParamList}) { ${safeBody} };`;
}

function buildFunctionReplacementExpr(
  name: string,
  paramList: string,
  bodyExpr: string
): string {
  const transformedExpr = bodyExpr.replace(/\byield\b/g, "return");
  const { safeParamList, safeBody: safeExpr } = sanitizeThisParam(paramList, transformedExpr);
  // Expression-bodied function: treat it as a single `return (expr)`.
  return `const ${name} = function(${safeParamList}) { return (${safeExpr}); };`;
}

function inferTypeSimple(expr: string): string {
  const t = expr.trim();
  if (/^readI32\(\)$/.test(t)) return "I32";
  if (/^readBool\(\)$/.test(t)) return "Bool";
  // read<ISize>() and read<USize>() are replaced with readI32() at compile time
  // but also accept their explicit forms when inferring types here.
  if (/^read<\s*ISize\s*>\s*\(\s*\)$/.test(t)) return "ISize";
  if (/^read<\s*USize\s*>\s*\(\s*\)$/.test(t)) return "USize";
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

function isNumericFamily(t: string): boolean {
  return t === "I32" || t === "ISize" || t === "USize";
}

export function checkFunctionCallTypes(
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
        if (expected === "unknown" || actual === "unknown") continue;
        if (expected === actual) continue;

        // Allow numeric-family interchangeability (I32 / ISize / USize)
        if (isNumericFamily(expected) && isNumericFamily(actual)) continue;

        const pname = paramNames[iArg] ?? `#${iArg + 1}`;
        return makeTypeError(fname, pname, expected, actual);
      }
    }
  }

  return undefined;
}
