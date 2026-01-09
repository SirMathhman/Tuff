import { parseOperandAt } from "../parser";
import { Env } from "../env";
import type { InterpretFn } from "../types";

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

export function extractAssignmentParts(stmt: string):
  | {
      isDeref: boolean;
      isDeclOnly: boolean;
      name: string;
      op: string | undefined;
      rhs: string;
      isThisField?: boolean;
      fieldName?: string;
      indexExpr?: string;
    }
  | undefined {
  // Try this.field assignment or compound (this.x += 1 or this.x = ...)
  let m = stmt.match(/^this\s*\.\s*([a-zA-Z_]\w*)\s*(?:([+\-*/%])=|=)\s*(.+)$/);
  if (m) {
    const op = m[2] ? m[2] : undefined;
    return {
      isDeref: false,
      isDeclOnly: false,
      name: m[1],
      op,
      rhs: m[3].trim(),
      isThisField: true,
      fieldName: m[1],
    };
  }

  // Small helper to build an assignment result object
  function buildAssignResult(obj: {
    isDeref: boolean;
    name: string;
    op: string | undefined;
    rhs: string;
    isThisField?: boolean;
    fieldName?: string;
    indexExpr?: string;
  }) {
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

  // Try deref compound assignment: *x += 1
  m = stmt.match(/^\*\s*([a-zA-Z_]\w*)\s*([+\-*/%])=\s*(.+)$/);
  if (m) {
    return buildAssignResult({
      isDeref: true,
      name: m[1],
      op: m[2],
      rhs: m[3],
    });
  }

  // Try compound assignment: x += 1
  m = stmt.match(/^([a-zA-Z_]\w*)\s*([+\-*/%])=\s*(.+)$/);
  if (m) {
    return buildAssignResult({
      isDeref: false,
      name: m[1],
      op: m[2],
      rhs: m[3],
    });
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

  // Try index assignment: x[expr] = ... or x[expr] += ...
  m = stmt.match(
    /^([a-zA-Z_]\w*)\s*\[\s*([\s\S]+?)\s*\]\s*([+\-*/%])?=\s*(.+)$/
  );
  if (m) {
    return {
      isDeref: false,
      isDeclOnly: false,
      name: m[1],
      op: m[3],
      rhs: m[4].trim(),
      indexExpr: m[2].trim(),
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
