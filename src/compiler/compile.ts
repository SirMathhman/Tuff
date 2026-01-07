import {
  checkArrayInitializersInDecls,
  checkExplicitArrayDecls,
  initializeArrayDecls,
} from "./arrays";
import {
  parseDeclarations,
  stripAnnotationsAndMut,
  checkImmutableAssignments,
} from "./declarations";
import {
  checkFunctionCallTypes,
  parseFunctions,
  findMatching,
} from "./functions";
import { applyStringAndCtorTransforms, parseStructs } from "./structs";

function replaceReads(input: string): string {
  const readI32Regex = /read<\s*I32\s*>\s*\(\s*\)/g;
  let out = input.replace(readI32Regex, "readI32()");
  const readBoolRegex = /read<\s*Bool\s*>\s*\(\s*\)/g;
  out = out.replace(readBoolRegex, "readBool()");
  return out;
}

interface ParseIfResult {
  replacement: string;
  nextIndex: number;
}

// eslint-disable-next-line complexity, max-lines-per-function
function parseIfAt(input: string, idx: number): ParseIfResult | undefined {
  // Ensure 'if' is a standalone word
  const before = input[idx - 1];
  const after = input[idx + 2];
  if (
    (before && /[A-Za-z0-9_$]/.test(before)) ||
    (after && /[A-Za-z0-9_$]/.test(after))
  ) {
    return undefined;
  }

  let j = idx + 2;
  while (j < input.length && /\s/.test(input[j])) j++;
  if (input[j] !== "(") return undefined;

  const k = findMatching(input, j + 1, "(", ")");
  if (k === undefined) return undefined;
  const cond = input.slice(j + 1, k - 1).trim();

  let p = k;
  while (p < input.length && /\s/.test(input[p])) p++;
  if (input[p] === "{") return undefined; // block true-arm — skip

  const foundElse = ((): number | undefined => {
    let i = p;
    let depth = 0;
    for (; i < input.length; i++) {
      const ch = input[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      if (
        depth === 0 &&
        input.startsWith("else", i) &&
        (i === 0 || /\W/.test(input[i - 1]))
      )
        return i;
    }
    return undefined;
  })();
  if (foundElse === undefined) return undefined;

  const thenPart = input.slice(p, foundElse).trim();

  let r = foundElse + 4;
  while (r < input.length && /\s/.test(input[r])) r++;
  if (input[r] === "{") return undefined; // block else-arm — skip

  // parse else expression until semicolon/newline/top-level end
  let s = r;
  for (; s < input.length; s++) {
    const ch = input[s];
    if (ch === ";" || ch === "\n" || ch === "\r") break;
  }
  const elsePart = input.slice(r, s).trim();

  return {
    replacement: `(${cond}) ? (${thenPart}) : (${elsePart})`,
    nextIndex: s,
  };
}

function transformIfExpressions(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    const idx = input.indexOf("if", i);
    if (idx === -1) {
      out += input.slice(i);
      break;
    }
    out += input.slice(i, idx);
    const parsed = parseIfAt(input, idx);
    if (!parsed) {
      // not a transformable `if` here -> copy 'if' and continue
      out += "if";
      i = idx + 2;
      continue;
    }

    out += parsed.replacement;
    i = parsed.nextIndex;
  }
  return out;
}

// eslint-disable-next-line complexity
function splitTopLevelStatements(blockInner: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < blockInner.length; i++) {
    const ch = blockInner[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      cur += ch;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      cur += ch;
    } else if (inSingle || inDouble) {
      cur += ch;
    } else if (ch === "(" || ch === "{" || ch === "[") {
      depth++;
      cur += ch;
    } else if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      cur += ch;
    } else if (ch === ";" && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// eslint-disable-next-line max-lines-per-function
function transformBlockExpressions(input: string): string {
  // Transform blocks used as expressions (e.g., `let x = { let y = 100; y }`)
  // into IIFEs that return the last expression in the block. We only
  // transform blocks that appear in expression positions -- e.g., after '='
  // or '(' or ',' or ':' or '?' or start-of-input.
  let out = "";
  let i = 0;
  while (i < input.length) {
    const idx = input.indexOf("{", i);
    if (idx === -1) {
      out += input.slice(i);
      break;
    }

    // Look at previous non-space char to decide if this is an expression block
    let prev = idx - 1;
    while (prev >= 0 && /\s/.test(input[prev])) prev--;
    const prevCh = prev >= 0 ? input[prev] : "";

    // Skip constructor forms like `Point { ... }` (identifier before '{')
    if (prevCh && (/[A-Za-z0-9_$]/.test(prevCh) || prevCh === ']' || prevCh === ')')) {
      out += input.slice(i, idx + 1);
      i = idx + 1;
      continue;
    }

    // Only transform when previous char suggests expression position
    const exprPrevChars = new Set([
      "=",
      "(",
      ":",
      ",",
      "?",
      "!",
      "+",
      "-",
      "*",
      "/",
      "%",
      "^",
      "&",
      "|",
      "~",
      "[",
      "{",
      "",
    ]);
    if (!exprPrevChars.has(prevCh)) {
      out += input.slice(i, idx + 1);
      i = idx + 1;
      continue;
    }

    // find matching brace
    const matching = findMatching(input, idx + 1, "{", "}");
    if (matching === undefined) {
      // unbalanced; copy and move on
      out += input.slice(i, idx + 1);
      i = idx + 1;
      continue;
    }

    const inner = input.slice(idx + 1, matching - 1);
    const stmts = splitTopLevelStatements(inner).map((s) =>
      transformBlockExpressions(s)
    );
    let iifeBody: string;
    if (stmts.length === 0) {
      iifeBody = `${inner}; return (0);`;
    } else if (stmts.length === 1) {
      // single statement - return it (stmt may be another block that got transformed)
      iifeBody = `return (${stmts[0]});`;
    } else {
      const last = stmts.pop()!;
      const rest = stmts.join("; ");
      iifeBody = `${rest}; return (${last});`;
    }

    const iife = `(function(){ ${iifeBody} })()`;
    out += input.slice(i, idx) + iife;
    i = matching;
  }
  return out;
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

export function compileImpl(input: string): string {
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

  // Convert expression-level `if (cond) a else b` into JS ternary expressions so
  // they can be used as expressions in compiled output.
  replaced = transformIfExpressions(replaced);

  // Convert block {...} used as expressions into IIFEs that return the last
  // expression in the block. This preserves block-scoped declarations.
  replaced = transformBlockExpressions(replaced);

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
