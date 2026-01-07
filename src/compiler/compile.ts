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

interface CompileCoreOk {
  trimmed: string;
  codeNoStructs: string;
  replaced: string;
  hasRead: boolean;
}

interface CompileCoreErr {
  error: string;
}

interface IdentifierAfterDot {
  id: string;
  afterId: number;
}

type CompileCoreResult = CompileCoreOk | CompileCoreErr;

function replaceReads(input: string): string {
  const readI32Regex = /read<\s*I32\s*>\s*\(\s*\)/g;
  let out = input.replace(readI32Regex, "readI32()");
  const readBoolRegex = /read<\s*Bool\s*>\s*\(\s*\)/g;
  out = out.replace(readBoolRegex, "readBool()");

  // Support read<ISize>() and read<USize>() by treating them as numeric reads
  // (runtime is JS number) using the same helper as I32.
  const readISizeRegex = /read<\s*ISize\s*>\s*\(\s*\)/g;
  out = out.replace(readISizeRegex, "readI32()");
  const readUSizeRegex = /read<\s*USize\s*>\s*\(\s*\)/g;
  out = out.replace(readUSizeRegex, "readI32()");

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

function looksLikeCodeExpression(trimmed: string): boolean {
  if (/^-?\d+$/.test(trimmed)) return true;
  if (/^(true|false)$/.test(trimmed)) return true;

  // Function call / grouping.
  if (/[A-Za-z_$][A-Za-z0-9_$]*\s*\(/.test(trimmed)) return true;

  // Obvious operators / punctuation that are unlikely to appear in plain text.
  if (/[()[\]{};=+\-*/%<>!?:]/.test(trimmed)) return true;

  // Module/package syntax.
  if (trimmed.includes("::")) return true;

  // Keywords strongly indicate code.
  if (
    /\b(let|mut|fn|if|else|while|for|break|continue|yield|return|struct|from|use|out)\b/.test(
      trimmed
    )
  ) {
    return true;
  }

  return false;
}

// Helper: parse identifier after a dot, e.g., `.foo(` returns { id: 'foo', afterId: idx }
function getIdentifierAfterDot(
  input: string,
  dot: number
): IdentifierAfterDot | undefined {
  const afterDot = input.slice(dot + 1);
  const idMatch = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(afterDot);
  if (!idMatch) return undefined;
  const id = idMatch[0];
  const afterId = dot + 1 + id.length;
  return { id, afterId };
}

// Helper: find the start index of the LHS expression for a dot at `dot`.
function findLhsStart(input: string, dot: number): number | undefined {
  let lhsStart = dot - 1;
  while (lhsStart >= 0 && /\s/.test(input[lhsStart])) lhsStart--;
  if (lhsStart < 0) return undefined;

  const ch = input[lhsStart];
  if (ch === ")") {
    // Find matching '(' backwards
    let depth = 1;
    let k = lhsStart - 1;
    for (; k >= 0 && depth > 0; k--) {
      const c2 = input[k];
      if (c2 === ")") depth++;
      else if (c2 === "(") depth--;
    }
    if (depth !== 0) return undefined;
    return k + 1;
  }

  // For numeric literals and identifiers, accept the same character class
  if (/[A-Za-z0-9_$]/.test(ch)) {
    let k = lhsStart;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(input[k])) k--;
    return k + 1;
  }

  return undefined;
}

// Transform method-call syntax like `100.addOnce()` or `(x).foo()` into
// equivalent function calls `addOnce(100)` so the existing call pipeline
// and type checking can handle an implicit `this` parameter.

// Transform method-call syntax like `100.addOnce()` or `(x).foo()` into
// equivalent function calls `addOnce(100)` so the existing call pipeline
// and type checking can handle an implicit `this` parameter.

// eslint-disable-next-line max-lines-per-function
function compileCore(input: string): CompileCoreResult {
  // Normalize input
  const trimmed = input.trim();

  // Extract and remove struct declarations first
  const structParsed = parseStructs(trimmed);
  let codeNoStructs = structParsed.code;
  const structs = structParsed.structs;

  // Transform `fn` declarations to JS functions before replacing reads
  const fnParsed = parseFunctions(codeNoStructs);
  if (fnParsed.error) return { error: fnParsed.error };
  codeNoStructs = fnParsed.code;

  let replaced = replaceReads(codeNoStructs);

  // Validate break/continue usages before we transform blocks/ifs so we can
  // provide clearer compile-time errors for illegal uses.
  const breakErr = validateBreakContinueUsage(replaced);
  if (breakErr) return { error: breakErr };

  // Transform blocks used as expressions before we transform expression-level ifs.
  replaced = transformBlockExpressions(replaced);
  replaced = transformIfExpressions(replaced);
  replaced = transformMethodCalls(replaced);

  const typeError = checkFunctionCallTypes(replaced, fnParsed);

  // Transform blocks used as expressions before we transform expression-level ifs.
  function transformMethodCalls(input: string): string {
    let out = "";
    let i = 0;
    while (i < input.length) {
      const dot = input.indexOf(".", i);
      if (dot === -1) {
        out += input.slice(i);
        break;
      }

      const ident = getIdentifierAfterDot(input, dot);
      if (!ident) {
        out += input.slice(i, dot + 1);
        i = dot + 1;
        continue;
      }
      const { id, afterId } = ident;

      // Skip whitespace between identifier and '('
      let argsOpen = afterId;
      while (argsOpen < input.length && /\s/.test(input[argsOpen])) argsOpen++;
      if (input[argsOpen] !== "(") {
        out += input.slice(i, dot + 1);
        i = dot + 1;
        continue;
      }

      const newLhsStart = findLhsStart(input, dot);
      if (newLhsStart === undefined) {
        out += input.slice(i, dot + 1);
        i = dot + 1;
        continue;
      }

      const lhsExpr = input.slice(newLhsStart, dot).trim();

      const matching = findMatching(input, argsOpen + 1, "(", ")");
      if (matching === undefined) {
        out += input.slice(i, dot + 1);
        i = dot + 1;
        continue;
      }

      const argsContent = input.slice(argsOpen + 1, matching - 1).trim();
      const newCall = `${id}(${lhsExpr}${
        argsContent ? ", " + argsContent : ""
      })`;

      // Append the part before LHS and the new call
      out += input.slice(i, newLhsStart) + newCall;
      i = matching;
    }

    return out;
  }
  if (typeError) return { error: typeError };

  const parsed = parseDeclarations(codeNoStructs);
  if (parsed.error) return { error: parsed.error };
  const decls = parsed.decls;

  const arrInitErr = checkArrayInitializersInDecls(codeNoStructs, decls);
  if (arrInitErr) return { error: arrInitErr };

  const arrExplicitErr = checkExplicitArrayDecls(codeNoStructs);
  if (arrExplicitErr) return { error: arrExplicitErr };

  replaced = initializeArrayDecls(replaced, decls);

  const hasRead =
    replaced.indexOf("readI32()") !== -1 ||
    replaced.indexOf("readBool()") !== -1;

  replaced = stripAnnotationsAndMut(replaced);
  replaced = applyStringAndCtorTransforms(replaced, structs, decls);

  const assignError = checkImmutableAssignments(replaced, decls);
  if (assignError) return { error: assignError };

  return { trimmed, codeNoStructs, replaced, hasRead };
}

export function compileProgramImpl(input: string): string {
  const core = compileCore(input);
  if ("error" in core) return `${core.error};`;

  const { trimmed, replaced, codeNoStructs, hasRead } = core;

  // If we have reads, or transformations, or any obvious statement forms,
  // emit JS as-is (statement context) and ensure a terminator.
  const isStatementLike = /;|\b(let|const|var)\b/.test(replaced);
  if (replaced !== codeNoStructs || hasRead || isStatementLike) {
    return replaced.trim().endsWith(";") ? replaced : `${replaced};`;
  }

  // For simple expression inputs, prefer evaluating the expression if it looks
  // like code; otherwise preserve legacy length-based behavior.
  if (looksLikeCodeExpression(trimmed)) {
    return `${replaced};`;
  }
  return `(${trimmed.length});`;
}

export function compileImpl(input: string): string {
  const core = compileCore(input);
  if ("error" in core) return core.error;

  const { trimmed, replaced, codeNoStructs, hasRead } = core;

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

  // For simple expression inputs, prefer evaluating the expression if it looks
  // like code; otherwise preserve legacy length-based behavior for plain text.
  if (looksLikeCodeExpression(trimmed)) return replaced;
  return `(${trimmed.length})`;
}
