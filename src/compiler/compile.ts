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
import {
  validateBreakContinueUsage,
  isExprIfAt,
  getWordBeforeIndex,
  isExprPrevChar,
  getWordBeforeParenIfAny,
} from "./breaks";
import { applyStringAndCtorTransforms, parseStructs } from "./structs";

function replaceReads(input: string): string {
  const readI32Regex = /read<\s*I32\s*>\s*\(\s*\)/g;
  let out = input.replace(readI32Regex, "readI32()");
  const readBoolRegex = /read<\s*Bool\s*>\s*\(\s*\)/g;
  out = out.replace(readBoolRegex, "readBool()");
  return out;
}

function iifeReturningLast(stmts: string[]): string {
  const cleaned = stmts.map((s) => s.trim()).filter(Boolean);
  let iifeBody: string;
  if (cleaned.length === 0) {
    iifeBody = "return (0);";
  } else if (cleaned.length === 1) {
    const single = cleaned[0] ?? "";
    if (/^\s*return\b/.test(single)) iifeBody = single;
    else iifeBody = `return (${single});`;
  } else {
    const restStmts = cleaned.slice(0, -1);
    const last = (cleaned[cleaned.length - 1] ?? "").trim();
    const rest = restStmts.join("; ");
    if (/^\s*return\b/.test(last)) iifeBody = `${rest}; ${last}`;
    else iifeBody = `${rest}; return (${last});`;
  }

  return `(function(){ ${iifeBody} })()`;
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

  // Determine if this `if` appears in an expression context (e.g., after '=' or 'return')
  const isExprContext = isExprIfAt(input, idx);

  if (!isExprContext) return undefined;

  let j = idx + 2;
  while (j < input.length && /\s/.test(input[j])) j++;
  if (input[j] !== "(") return undefined;

  const k = findMatching(input, j + 1, "(", ")");
  if (k === undefined) return undefined;
  const cond = input.slice(j + 1, k - 1).trim();

  let p = k;
  while (p < input.length && /\s/.test(input[p])) p++;

  // Handle block true-arm by converting it to an IIFE for expression use.
  let thenPart: string | undefined;
  let searchAfterThen = p;
  if (input[p] === "{") {
    const thenClose = findMatching(input, p + 1, "{", "}");
    if (thenClose === undefined) return undefined;
    const inner = input.slice(p + 1, thenClose - 1);
    thenPart = iifeReturningLast(splitTopLevelStatements(inner));
    searchAfterThen = thenClose;
  }

  const foundElse = ((): number | undefined => {
    let i = searchAfterThen;
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

  if (!thenPart) {
    // non-block then-arm: take literal slice
    thenPart = input.slice(p, foundElse).trim();
  }

  let r = foundElse + 4;
  while (r < input.length && /\s/.test(input[r])) r++;

  // Handle block else-arm by converting it to an IIFE, otherwise read expression
  let elsePart: string;
  let s = r;
  if (input[r] === "{") {
    const elseClose = findMatching(input, r + 1, "{", "}");
    if (elseClose === undefined) return undefined;
    const inner = input.slice(r + 1, elseClose - 1);
    elsePart = iifeReturningLast(splitTopLevelStatements(inner));
    s = elseClose;
  } else {
    for (; s < input.length; s++) {
      const ch = input[s];
      if (ch === ";" || ch === "\n" || ch === "\r") break;
    }
    elsePart = input.slice(r, s).trim();
  }

  const repl = `(${cond}) ? (${thenPart}) : (${elsePart})`;
  return {
    replacement: repl,
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

// eslint-disable-next-line complexity, max-lines-per-function
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
      // If we've closed a top-level block (depth becomes 0 after a '}'),
      // treat it as an end of a top-level statement so constructs like
      // `if (cond) { ... } x` split into `if (cond) { ... }` and `x`.
      //
      // IMPORTANT: do NOT split after ')' here. That breaks expressions like
      // ternaries `(cond) ? a : b` and member access `(...).prop`.
      if (depth === 0 && ch === "}") {
        let p = i + 1;
        while (p < blockInner.length && /\s/.test(blockInner[p])) p++;
        let nextWord = "";
        if (p < blockInner.length && /[A-Za-z_$]/.test(blockInner[p])) {
          const wstart = p;
          let wend = p;
          while (
            wend < blockInner.length &&
            /[A-Za-z0-9_$]/.test(blockInner[wend])
          )
            wend++;
          nextWord = blockInner.slice(wstart, wend);
        }
        if (nextWord !== "else") {
          parts.push(cur.trim());
          cur = "";
        }
      }
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

// eslint-disable-next-line complexity, max-lines-per-function
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

    // Skip constructor forms like `Point { ... }` (identifier before '{'),
    // except when the word before is `else` (we should transform `else { .. }`).
    if (prevCh && (/[A-Za-z0-9_$]/.test(prevCh) || prevCh === "]")) {
      let skip = true;
      if (/[A-Za-z0-9_$]/.test(prevCh)) {
        const word = getWordBeforeIndex(input, prev);
        if (word === "else") skip = false;
      }

      if (skip) {
        out += input.slice(i, idx + 1);
        i = idx + 1;
        continue;
      }
    }

    // Only transform when previous char suggests expression position
    if (!isExprPrevChar(prevCh)) {
      out += input.slice(i, idx + 1);
      i = idx + 1;
      continue;
    }

    // Do not transform function or control-structure bodies into IIFEs.
    if (prevCh === ")") {
      const word = getWordBeforeParenIfAny(input, prev);
      if (
        word === "function" ||
        word === "if" ||
        word === "while" ||
        word === "for" ||
        word === "switch"
      ) {
        out += input.slice(i, idx + 1);
        i = idx + 1;
        continue;
      }
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
    const iife = iifeReturningLast(stmts);
    out += input.slice(i, idx) + iife;
    i = matching;
  }
  return out;
}

function wrapStatements(code: string): string {
  const parts = splitTopLevelStatements(code)
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

  // First convert block {...} used as expressions into IIFEs that return the
  // last expression in the block. Doing this first ensures `if (cond) { ... }
  // else { ... }` arms are transformed into expressions and can then be
  // converted by the `if` -> ternary transform.
  // Validate break/continue usages before we transform blocks/ifs so we can
  // provide clearer compile-time errors for illegal uses (e.g., break outside
  // loops or break inside expression-level blocks which become IIFEs).
  const breakErr = validateBreakContinueUsage(replaced);
  if (breakErr) return breakErr;

  replaced = transformBlockExpressions(replaced);

  // Convert expression-level `if (cond) a else b` into JS ternary expressions so
  // they can be used as expressions in compiled output.
  replaced = transformIfExpressions(replaced);

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
