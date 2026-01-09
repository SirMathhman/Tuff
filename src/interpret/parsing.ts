import { parseOperandAt } from "../parser";
import { Env } from "../env";
import type { InterpretFn } from "../types";

type AssignmentParts = {
  isDeref: boolean;
  isDeclOnly: boolean;
  name: string;
  op: string | undefined;
  rhs: string;
  isThisField?: boolean;
  fieldName?: string;
  indexExpr?: string;
};

function buildAssignResult(obj: {
  isDeref: boolean;
  name: string;
  op: string | undefined;
  rhs: string;
  isThisField?: boolean;
  fieldName?: string;
  indexExpr?: string;
}): AssignmentParts {
  return {
    isDeref: obj.isDeref,
    isDeclOnly: false,
    name: obj.name,
    op: obj.op,
    rhs: obj.rhs.trim(),
    isThisField: obj.isThisField,
    fieldName: obj.fieldName,
    indexExpr: obj.indexExpr,
  };
}

function parseThisFieldAssignment(stmt: string): AssignmentParts | undefined {
  const m = stmt.match(
    /^this\s*\.\s*([a-zA-Z_]\w*)\s*(?:([+\-*/%])=|=)\s*(.+)$/
  );
  if (!m) return undefined;
  return buildAssignResult({
    isDeref: false,
    name: m[1],
    op: m[2] ? m[2] : undefined,
    rhs: m[3],
    isThisField: true,
    fieldName: m[1],
  });
}

function parseDerefCompoundAssignment(
  stmt: string
): AssignmentParts | undefined {
  const m = stmt.match(/^\*\s*([a-zA-Z_]\w*)\s*([+\-*/%])=\s*(.+)$/);
  if (!m) return undefined;
  return buildAssignResult({ isDeref: true, name: m[1], op: m[2], rhs: m[3] });
}

function parseCompoundAssignment(stmt: string): AssignmentParts | undefined {
  const m = stmt.match(/^([a-zA-Z_]\w*)\s*([+\-*/%])=\s*(.+)$/);
  if (!m) return undefined;
  return buildAssignResult({ isDeref: false, name: m[1], op: m[2], rhs: m[3] });
}

function parseDerefAssignment(stmt: string): AssignmentParts | undefined {
  const m = stmt.match(/^\*\s*([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (!m) return undefined;
  return {
    isDeref: true,
    isDeclOnly: false,
    name: m[1],
    op: undefined,
    rhs: m[2].trim(),
  };
}

function parseIndexAssignment(stmt: string): AssignmentParts | undefined {
  const m = stmt.match(
    /^([a-zA-Z_]\w*)\s*\[\s*([\s\S]+?)\s*\]\s*([+\-*/%])?=\s*(.+)$/
  );
  if (!m) return undefined;
  return {
    isDeref: false,
    isDeclOnly: false,
    name: m[1],
    op: m[3],
    rhs: m[4].trim(),
    indexExpr: m[2].trim(),
  };
}

function parseSimpleAssignment(stmt: string): AssignmentParts | undefined {
  const m = stmt.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (!m) return undefined;
  return {
    isDeref: false,
    isDeclOnly: false,
    name: m[1],
    op: undefined,
    rhs: m[2].trim(),
  };
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

export function extractAssignmentParts(
  stmt: string
): AssignmentParts | undefined {
  return (
    parseThisFieldAssignment(stmt) ||
    parseDerefCompoundAssignment(stmt) ||
    parseCompoundAssignment(stmt) ||
    parseDerefAssignment(stmt) ||
    parseIndexAssignment(stmt) ||
    parseSimpleAssignment(stmt)
  );
}

type ExpandState = {
  expr: string;
  placeholders: string[];
  env: Env;
  interpret: InterpretFn;
  getLastTopLevelStatement_fn: (_s: string) => string | undefined;
};

function replaceWithPlaceholder(
  state: ExpandState,
  kind: string,
  matched: string
) {
  const ph = `__${kind}_PLACEHOLDER_${state.placeholders.length}__`;
  state.placeholders.push(matched);
  state.expr = state.expr.replace(matched, ph);
  return ph;
}

function processMatchedGroup(
  state: ExpandState,
  m: string,
  inner: string,
  idx: number
) {
  const prefix = state.expr.slice(0, idx);

  if (m[0] === "{" && /\bmatch\b(?:\s*\([^()]*\))?\s*$/.test(prefix)) {
    replaceWithPlaceholder(state, "MATCH_BLOCK", m);
    return;
  }
  if (m[0] === "{" && /=>\s*$/.test(prefix)) {
    replaceWithPlaceholder(state, "FN_BODY", m);
    return;
  }
  if (m[0] === "(" && /\bfn\s+[a-zA-Z_]\w*\s*$/.test(prefix)) {
    replaceWithPlaceholder(state, "FN_PARAMS", m);
    return;
  }

  if (/\blet\s+[a-zA-Z_]\w*\s*=\s*$/.test(prefix)) {
    const last = state.getLastTopLevelStatement_fn(inner);
    if (!last || /^let\b/.test(last))
      throw new Error("initializer cannot contain declarations");
  }

  const v =
    m[0] === "{"
      ? state.interpret(m, state.env)
      : state.interpret(inner, state.env);
  const after = state.expr.slice(idx + m.length);
  const afterMatch = after.match(/\s*([^\s])/);
  const afterNon = afterMatch ? afterMatch[1] : undefined;
  let replacement = String(v);
  if (m[0] === "{" && afterNon && !/[+\-*/%)}\]]/.test(afterNon)) {
    replacement = replacement + ";";
  }
  state.expr = state.expr.replace(m, replacement);
}

function parseFnHeader(stmt: string) {
  const m = stmt.match(/^fn\s+([a-zA-Z_]\w*)/);
  if (!m) throw new Error("invalid fn declaration");
  const name = m[1];
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
  return { name, params, endIdx };
}

function parseOptionalResultAnnotation(afterParams: string) {
  let rest = afterParams;
  let resultAnnotation: string | undefined = undefined;
  if (!rest.startsWith(":")) return { rest, resultAnnotation };

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
  return { rest, resultAnnotation };
}

function extractBracedFnBody(stmt: string, startSearchIdx: number) {
  const bStart = stmt.indexOf("{", startSearchIdx);
  const bEnd = findMatchingParen(stmt, bStart, "{", "}");
  if (bEnd === -1) throw new Error("unbalanced braces in fn");
  const body = stmt.slice(bStart, bEnd + 1);
  let trailingExpr: string | undefined = undefined;
  if (bEnd < stmt.length - 1) {
    trailingExpr = stmt.slice(bEnd + 1).trim();
    if (trailingExpr === "") trailingExpr = undefined;
  }
  return { body, isBlock: true, trailingExpr };
}

export function expandParensAndBraces(
  s: string,
  env: Env,
  interpret: InterpretFn,
  getLastTopLevelStatement_fn: (_s: string) => string | undefined
): string {
  if (!s.includes("(") && !s.includes("{")) return s;

  const state: ExpandState = {
    expr: s,
    placeholders: [],
    env,
    interpret,
    getLastTopLevelStatement_fn,
  };

  const parenRegex = /\([^()]*\)|\{[^{}]*\}/;
  while (parenRegex.test(state.expr)) {
    const m = state.expr.match(parenRegex)![0];
    const inner = m.slice(1, -1);
    const idx = state.expr.indexOf(m);
    processMatchedGroup(state, m, inner, idx);
  }

  for (let i = 0; i < state.placeholders.length; i++) {
    state.expr = state.expr.replace(
      `__MATCH_BLOCK_PLACEHOLDER_${i}__`,
      state.placeholders[i]
    );
  }

  return state.expr;
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
  const { name, params, endIdx } = parseFnHeader(stmt);
  const afterParams = stmt.slice(endIdx + 1).trim();
  const { rest, resultAnnotation } = parseOptionalResultAnnotation(afterParams);

  const parseBracedBody = () => extractBracedFnBody(stmt, endIdx + 1);

  let body: string = "";
  let isBlock = false;
  let trailingExpr: string | undefined = undefined;

  let shouldParseBracedBody = false;

  if (rest.startsWith("=>")) {
    const afterArrow = rest.slice(2).trim();
    shouldParseBracedBody = afterArrow.startsWith("{");
    if (!shouldParseBracedBody) {
      body = afterArrow;
      if (!body) throw new Error("missing fn body");
    }
  } else {
    shouldParseBracedBody = rest.startsWith("{");
    if (!shouldParseBracedBody) throw new Error("invalid fn body");
  }

  if (shouldParseBracedBody) {
    const br = parseBracedBody();
    body = br.body;
    isBlock = br.isBlock;
    trailingExpr = br.trailingExpr;
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
