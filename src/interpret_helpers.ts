import { parseOperand } from "./parser";
import { evaluateReturningOperand, checkRange } from "./eval";

export function getLastTopLevelStatement(
  str: string,
  // eslint-disable-next-line no-unused-vars
  splitTopLevelStatements: (_s: string) => string[]
): string | null {
  const parts = splitTopLevelStatements(str)
    .map((p: string) => p.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

export function evaluateRhs(
  rhs: string,
  envLocal: Record<string, any>,
  // eslint-disable-next-line no-unused-vars
  interpret: (_input: string, _env?: Record<string, any>) => number,
  // eslint-disable-next-line no-unused-vars
  getLastTopLevelStatement_fn: (_s: string) => string | null
): any {
  if (/^\s*\{[\s\S]*\}\s*$/.test(rhs)) {
    const inner = rhs.replace(/^\{\s*|\s*\}$/g, "");
    const lastInner = getLastTopLevelStatement_fn(inner);
    if (!lastInner) throw new Error("initializer cannot be empty block");
    if (/^let\b/.test(lastInner))
      throw new Error("initializer cannot contain declarations");
    const v = interpret(inner, {});
    if (Number.isInteger(v)) return { valueBig: BigInt(v) };
    return { floatValue: v, isFloat: true };
  }
  if (/^\s*let\b/.test(rhs) || /\{[^}]*\blet\b/.test(rhs))
    throw new Error("initializer cannot contain declarations");
  return evaluateReturningOperand(rhs, envLocal);
}

export function checkAnnMatchesRhs(ann: any, rhsOperand: any) {
  if (!(ann as any).valueBig)
    throw new Error("annotation must be integer literal with suffix");
  if (!(rhsOperand as any).valueBig)
    throw new Error(
      "initializer must be integer-like to match annotated literal"
    );
  if ((ann as any).valueBig !== (rhsOperand as any).valueBig)
    throw new Error("annotation value does not match initializer");
  if ((rhsOperand as any).kind) {
    if (
      (ann as any).kind !== (rhsOperand as any).kind ||
      (ann as any).bits !== (rhsOperand as any).bits
    )
      throw new Error("annotation kind/bits do not match initializer");
  }
}

export function validateTypeOnly(kind: string, bits: number, rhsOperand: any) {
  if (!(rhsOperand as any).valueBig)
    throw new Error("annotation must be integer type matching initializer");
  if ((rhsOperand as any).kind) {
    if ((rhsOperand as any).kind !== kind || (rhsOperand as any).bits !== bits)
      throw new Error("annotation kind/bits do not match initializer");
  } else {
    checkRange(kind, bits, (rhsOperand as any).valueBig as bigint);
  }
}

export function validateAnnotation(
  annotation: string | null | any,
  rhsOperand: any
) {
  if (!annotation) return;

  // pointer annotation: *<inner>
  if (typeof annotation === "string" && /^\s*\*/.test(annotation)) {
    const inner = annotation.replace(/^\s*\*/g, "").trim();
    if (!rhsOperand || !(rhsOperand as any).pointer)
      throw new Error("annotation requires pointer initializer");
    // inner can be type-only like I32, Bool, or a literal operand
    const parsedType = (function (s: string) {
      const t = s.match(/^\s*([uUiI])\s*(\d+)\s*$/);
      if (!t) return null;
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
      if ((rhsOperand as any).ptrIsBool !== true)
        throw new Error("annotation Pointer Bool requires boolean initializer");
      return;
    }
    // otherwise inner might be a literal like 1I32
    const ann = parseOperand(inner);
    if (!ann) throw new Error("invalid annotation in let");
    // ensure pointer's pointed literal matches
    checkAnnMatchesRhs(ann, {
      valueBig: (rhsOperand as any).valueBig,
      kind: (rhsOperand as any).kind,
      bits: (rhsOperand as any).bits,
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
    if (
      !(rhsOperand as any).boolValue &&
      (rhsOperand as any).boolValue !== false
    )
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

export function extractAssignmentParts(stmt: string): {
  isDeref: boolean;
  isDeclOnly: boolean;
  name: string;
  op: string | null;
  rhs: string;
  isThisField?: boolean;
  fieldName?: string;
} | null {
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
      op: null,
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
      op: null,
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
      op: null,
      rhs: m[2].trim(),
    };
  }

  return null;
}

export function expandParensAndBraces(
  s: string,
  env: Record<string, any>,
  // eslint-disable-next-line no-unused-vars
  interpret: (_input: string, _env?: Record<string, any>) => number,
  // eslint-disable-next-line no-unused-vars
  getLastTopLevelStatement_fn: (_s: string) => string | null
): string {
  if (!s.includes("(") && !s.includes("{")) return s;

  let expr = s;
  const parenRegex = /\([^()]*\)|\{[^{}]*\}/;
  const placeholders: string[] = [];

  while (parenRegex.test(expr)) {
    const m = expr.match(parenRegex)![0];
    const inner = m.slice(1, -1);
    const idx = expr.indexOf(m);
    const prefix = expr.slice(0, idx);

    // Skip match bodies; they are handled later by expression evaluator
    if (m[0] === "{" && /\bmatch\b(?:\s*\([^()]*\))?\s*$/.test(prefix)) {
      const ph = `__MATCH_BLOCK_PLACEHOLDER_${placeholders.length}__`;
      placeholders.push(m);
      expr = expr.replace(m, ph);
      continue;
    }

    // Disallow declarations inside initializers
    if (/\blet\s+[a-zA-Z_]\w*\s*=\s*$/.test(prefix)) {
      const last = getLastTopLevelStatement_fn(inner);
      if (!last || /^let\b/.test(last))
        throw new Error("initializer cannot contain declarations");
    }

    const v = interpret(inner, env);
    const after = expr.slice(idx + m.length);
    const afterMatch = after.match(/\s*([^\s])/);
    const afterNon = afterMatch ? afterMatch[1] : null;
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
): { op?: string; operand?: any }[] {
  // eslint-disable-next-line no-undef
  const { parseOperandAt } = require("./parser");
  const exprTokens: { op?: string; operand?: any }[] = [];
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
      let op: string | null = null;
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
        const ann = parts[1] ? parts.slice(1).join(":").trim() : null;
        return { name, annotation: ann };
      })
    : [];

  let after = stmt.slice(endIdx + 1).trim();
  let body: string = "";
  let isBlock = false;
  // optional result annotation: `: <annotation>` before `=>` or `{`
  let resultAnnotation: string | null = null;
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

  let trailingExpr: string | null = null;

  // helper to extract a braced body and any trailing expression
  function extractBracedBody(startSearchIdx: number) {
    const bStart = stmt.indexOf("{", startSearchIdx);
    const bEnd = findMatchingParen(stmt, bStart, "{", "}");
    if (bEnd === -1) throw new Error("unbalanced braces in fn");
    body = stmt.slice(bStart, bEnd + 1);
    isBlock = true;
    if (bEnd < stmt.length - 1) {
      trailingExpr = stmt.slice(bEnd + 1).trim();
      if (trailingExpr === "") trailingExpr = null;
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
  localEnv: Record<string, any>,
  declared: Set<string>
): string | null {
  // support `fn name(<params>) => <expr>` or `fn name(<params>) { <stmts> }`
  const parsed = parseFnComponents(stmt);
  const { name, params, resultAnnotation, body, isBlock, trailingExpr } =
    parsed;
  if (declared.has(name)) throw new Error("duplicate declaration");

  // reserve name then attach closure env including the function itself
  declared.add(name);
  localEnv[name] = {
    fn: { params, body, isBlock, resultAnnotation, closureEnv: null },
  };
  (localEnv[name] as any).fn.closureEnv = { ...localEnv };

  return trailingExpr;
}

export function convertOperandToNumber(operand: any): number {
  if (operand && (operand as any).boolValue !== undefined)
    return (operand as any).boolValue ? 1 : 0;
  if (operand && (operand as any).kind)
    return Number((operand as any).valueBig as bigint);
  if (typeof operand === "number") return operand;
  if (operand && (operand as any).isFloat)
    return (operand as any).floatValue as number;
  return Number((operand as any).valueBig as bigint);
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
