import { Result, ok, err } from "./result";

// Reduce parentheses before using expressions (used by interpret)
function reduceParentheses(expr: string): Result<string, string> {
  let s = expr;
  // Evaluate innermost parentheses repeatedly
  while (s.includes("(")) {
    const openIdx = s.lastIndexOf("(");
    const closeIdx = s.indexOf(")", openIdx);
    if (closeIdx === -1) return err("Mismatched parentheses");
    const inner = s.slice(openIdx + 1, closeIdx).trim();
    if (inner.length === 0) return err("Empty parentheses");
    // Evaluate inner expression using existing arithmetic evaluator
    const evalRes = evaluateArithmetic(inner);
    if (!evalRes.ok) return err(evalRes.error);
    s = s.slice(0, openIdx) + String(evalRes.value) + s.slice(closeIdx + 1);
  }
  return ok(s);
}

export function interpret(input: string): Result<number, string> {
  let trimmed = input.trim();

  // Let-binding: let name [: Type] = init; body
  if (trimmed.startsWith("let ")) {
    return evalLetBinding(trimmed);
  }

  const blockRes = tryEvalBlock(trimmed);
  if (blockRes) return blockRes;

  const programRes = tryEvalProgram(input);
  if (programRes) return programRes;

  const dupStructs = checkDuplicateStructs(trimmed);
  if (!dupStructs.ok) return err(dupStructs.error);

  const structHandled = handleStructDeclaration(trimmed);
  if (structHandled) return structHandled;

  // Reduce parentheses first (evaluate innermost parentheses recursively)
  if (trimmed.includes("(")) {
    const reduced = reduceParentheses(trimmed);
    if (!reduced.ok) return err(reduced.error);
    trimmed = reduced.value;
  }

  // Boolean literal support
  if (trimmed.toLowerCase() === "true") return ok(1);
  if (trimmed.toLowerCase() === "false") return ok(0);

  // Direct numeric literal
  const n = Number(trimmed);
  if (Number.isFinite(n)) {
    return ok(n);
  }

  // Simple arithmetic chains with +, -, *, / (no parentheses).
  // Evaluate * and / first (left-to-right), then + and - left-to-right.
  const arithChainRe =
    /^\s*[+\-]?\d+(?:\.\d+)?(?:\s*[+\-*/]\s*[+\-]?\d+(?:\.\d+)?)*\s*$/;
  if (arithChainRe.test(trimmed)) {
    return evaluateArithmetic(trimmed);
  }

  return err("Err");
}

function tryEvalProgram(input: string): Result<number, string> | undefined {
  const topStmts = parseTopLevelStatements(input);
  if (topStmts && topStmts.length > 1) return evalProgram(topStmts);
  return undefined;
}

function tryEvalBlock(trimmed: string): Result<number, string> | undefined {
  if (!trimmed.startsWith("{")) return undefined;
  const closeIdx = findMatchingBrace(trimmed, 0);
  if (closeIdx === -1) return err("Mismatched braces");
  const inner = trimmed.slice(1, closeIdx).trim();
  if (inner.length === 0) return err("Empty block");
  const evalRes = interpret(inner);
  if (!evalRes.ok) return err(evalRes.error);
  // If there's trailing code after the block, evaluate it next (block-local bindings shouldn't leak)
  const rest = trimmed.slice(closeIdx + 1).trim();
  if (rest.length === 0) return evalRes;
  return interpret(rest);
}

function evaluateArithmetic(expr: string): Result<number, string> {
  const tokenRe = /[+\-]?\d+(?:\.\d+)?|[+\-*/]/g;
  const tokens = expr.match(tokenRe) || [];
  const nums: number[] = [];
  const ops: string[] = [];
  for (const t of tokens) {
    if (/^[+\-]?\d/.test(t)) nums.push(Number(t));
    else ops.push(t);
  }
  if (nums.length === 0) return err("Invalid expression");

  // First pass: handle * and /
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op === "*" || op === "/") {
      const a = nums[i];
      const b = nums[i + 1];
      if (!Number.isFinite(b)) return err("Invalid number in expression");
      let res: number;
      if (op === "*") res = a * b;
      else {
        if (b === 0) return err("Division by zero");
        res = a / b;
      }
      nums[i] = res;
      nums.splice(i + 1, 1);
      ops.splice(i, 1);
      i--; // re-check at current index
    }
  }

  // Second pass: handle + and - left-to-right
  let acc = nums[0];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const n = nums[i + 1];
    if (!Number.isFinite(n)) return err("Invalid number in expression");
    if (op === "+") acc += n;
    else acc -= n;
  }
  return ok(acc);
}

function evalLetBinding(input: string): Result<number, string> {
  // input starts with 'let '
  const rest = input.slice(4).trim();
  const eqIdx = rest.indexOf("=");
  if (eqIdx === -1) return err("Invalid let binding");
  const beforeEq = rest.slice(0, eqIdx).trim();
  const afterEq = rest.slice(eqIdx + 1);

  // Find semicolon at depth zero to separate init and body
  const semIdx = findSemicolonAtDepthZero(afterEq, 0);
  if (semIdx === -1) return err("Invalid let binding; missing ';'");

  const initExpr = afterEq.slice(0, semIdx).trim();
  const body = afterEq.slice(semIdx + 1).trim();

  const header = parseLetBindingHeader(beforeEq);
  if (!header.ok) return err(header.error);
  const isMut = header.value.isMut;
  const name = header.value.name;
  const type = header.value.type;

  const initRes = interpret(initExpr);
  if (!initRes.ok) return err(initRes.error);
  let value = initRes.value;
  if (type && type.toLowerCase() === "bool") {
    if (value !== 0) value = 1;
    else value = 0;
  }

  // Detect duplicate binding anywhere in body (shadowing disallowed)
  const dupRe = new RegExp("\\blet\\s+" + name + "\\b");
  if (dupRe.test(body)) return err("Duplicate binding");

  if (!isMut) {
    // Non-mutable: disallow assignment to this name in the body
    if (new RegExp("\\b" + name + "\\s*=").test(body))
      return err("Assignment to immutable variable");

    // Substitute the variable name in body with its numeric value (word boundary)
    const replaced = body.replace(
      new RegExp("\\b" + name + "\\b", "g"),
      String(value)
    );
    return interpret(replaced);
  }

  // Mutable binding: delegate to helper to process assignments sequentially
  return evalMutableBinding(name, value, body);
}

function parseLetBindingHeader(
  beforeEq: string
): Result<{ name: string; isMut: boolean; type?: string }, string> {
  const mm = beforeEq.match(
    /^(?:mut\s+)?([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?$/
  );
  if (!mm) return err("Invalid let binding");
  return ok({ name: mm[1], isMut: beforeEq.startsWith("mut "), type: mm[2] });
}

function splitAtTopLevelSemicolons(input: string): string[] {
  const out: string[] = [];
  let depthParen = 0;
  let depthBrace = 0;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depthParen++;
    else if (ch === ")") depthParen--;
    else if (ch === "{") depthBrace++;
    else if (ch === "}") depthBrace--;
    if (ch === ";" && depthParen === 0 && depthBrace === 0) {
      out.push(input.slice(start, i));
      start = i + 1;
    }
  }
  out.push(input.slice(start));
  return out;
}

function replaceVars(input: string, vars: Record<string, number>): string {
  let out = input;
  for (const k of Object.keys(vars)) {
    out = out.replace(new RegExp("\\b" + k + "\\b", "g"), String(vars[k]));
  }
  return out;
}

function evalMutableBinding(
  name: string,
  initialValue: number,
  body: string
): Result<number, string> {
  const stmts = splitAtTopLevelSemicolons(body);
  const vars: Record<string, number> = {};
  vars[name] = initialValue;
  let lastExpr: string | undefined;
  for (const stmt of stmts) {
    const s = stmt.trim();
    if (s.length === 0) {
      // skip empty
    } else {
      const assignMatch = s.match(new RegExp("^" + name + "\\s*=\\s*(.+)$"));
      if (assignMatch) {
        const rhs = assignMatch[1].trim();
        const rhsReplaced = replaceVars(rhs, vars);
        const r = interpret(rhsReplaced);
        if (!r.ok) return err(r.error);
        vars[name] = r.value;
      } else {
        lastExpr = s;
      }
    }
  }

  if (!lastExpr) return ok(0);
  const finalExpr = replaceVars(lastExpr, vars);
  const finalRes = interpret(finalExpr);
  if (!finalRes.ok) return err(finalRes.error);
  return finalRes;
}

function findSemicolonAtDepthZero(input: string, startIdx: number): number {
  let depth = 0;
  for (let i = startIdx; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth === 0 && ch === ";") return i;
  }
  return -1;
}

function findMatchingBrace(input: string, startIdx: number): number {
  let depth = 0;
  for (let i = startIdx; i < input.length; i++) {
    const ch = input[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) return i;
  }
  return -1;
}

function checkDuplicateStructs(input: string): Result<void, string> {
  const structRe = /struct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{[^}]*\}/gi;
  const names: string[] = [];
  for (const m of input.matchAll(structRe)) {
    names.push(m[1]);
  }
  const counts: Record<string, number> = {};
  for (const n of names) {
    counts[n] = (counts[n] || 0) + 1;
    if (counts[n] > 1) return err("Duplicate binding");
  }
  return ok(undefined);
}

function handleStructDeclaration(
  input: string
): Result<number, string> | undefined {
  const structMatch = input.match(
    /^\s*struct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([^}]*)\}\s*$/i
  );
  if (!structMatch) return undefined;
  const fieldsStr = structMatch[2].trim();
  if (fieldsStr.length === 0) return ok(0);

  const items = fieldsStr
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const seen: Record<string, number> = {};
  const allowedTypes = new Set(["i32", "i64", "bool"]);

  for (const it of items) {
    const m = it.match(
      /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)$/
    );
    if (!m) return err("Invalid field declaration");
    const fname = m[1];
    const ftype = m[2];
    seen[fname] = (seen[fname] || 0) + 1;
    if (seen[fname] > 1) return err("Duplicate field");
    if (!allowedTypes.has(ftype.toLowerCase()))
      return err(`Unknown type: ${ftype}`);
  }

  const programRes = tryEvalProgram(input);
  if (programRes) return programRes;
  return ok(0);
}

function parseTopLevelStatements(input: string): string[] | undefined {
  const out: string[] = [];
  let i = 0;

  while (i < input.length) {
    i = skipWhitespace(input, i);
    if (i >= input.length) {
      i = input.length;
    } else {
      const next = readNextTopLevelStatement(input, i);
      if (!next) return undefined;
      out.push(next.stmt);
      i = next.nextIdx;
    }
  }

  return out;
}

function skipWhitespace(input: string, startIdx: number): number {
  let i = startIdx;
  while (i < input.length && /\s/.test(input[i])) i++;
  return i;
}

function readNextTopLevelStatement(
  input: string,
  startIdx: number
): { stmt: string; nextIdx: number } | undefined {
  const rest = input.slice(startIdx);
  const isStruct = /^struct\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/i.test(rest);
  if (isStruct) {
    const openIdx = startIdx + rest.indexOf("{");
    const closeIdx = findMatchingBrace(input, openIdx);
    if (closeIdx === -1) return undefined;
    return { stmt: input.slice(startIdx, closeIdx + 1), nextIdx: closeIdx + 1 };
  }

  const semIdx = findSemicolonAtDepthZero(input, startIdx);
  if (semIdx === -1) {
    return { stmt: input.slice(startIdx), nextIdx: input.length };
  }
  return { stmt: input.slice(startIdx, semIdx), nextIdx: semIdx + 1 };
}

type _ProgramValue = number | Record<string, number>;

type _ProgramContext = {
  structDefs: Record<string, string[]>;
  vars: Record<string, _ProgramValue>;
  muts: Record<string, boolean>;
};

function evalProgram(stmts: string[]): Result<number, string> {
  const ctx: _ProgramContext = { structDefs: {}, vars: {}, muts: {} };
  let lastExpr: string | undefined;

  for (const raw of stmts) {
    const s = raw.trim();
    if (s.length !== 0) {
      const handled = evalProgramStatement(ctx, s);
      if (!handled.ok) return err(handled.error);
      if (handled.value.lastExpr !== undefined)
        lastExpr = handled.value.lastExpr;
    }
  }

  if (!lastExpr) return ok(0);
  return resolveExpression(lastExpr, ctx.vars);
}

function evalProgramStatement(
  ctx: _ProgramContext,
  stmt: string
): Result<{ lastExpr?: string }, string> {
  const structRes = tryHandleProgramStruct(ctx, stmt);
  if (structRes) return structRes;

  const letRes = tryHandleProgramLet(ctx, stmt);
  if (letRes) return letRes;

  const assignRes = tryHandleProgramAssignment(ctx, stmt);
  if (assignRes) return assignRes;

  return ok({ lastExpr: stmt });
}

function tryHandleProgramStruct(
  ctx: _ProgramContext,
  stmt: string
): Result<{ lastExpr?: string }, string> | undefined {
  if (!stmt.startsWith("struct ")) return undefined;
  const m = stmt.match(/^struct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([^}]*)\}\s*$/i);
  if (!m) return err("Invalid struct declaration");
  const name = m[1];
  if (name in ctx.structDefs) return err("Duplicate binding");
  const fields = parseStructFieldNames(m[2]);
  if (!fields.ok) return err(fields.error);
  ctx.structDefs[name] = fields.value;
  return ok({});
}

function parseStructFieldNames(fieldsStr: string): Result<string[], string> {
  const items = fieldsStr
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  const fields: string[] = [];
  for (const it of items) {
    const mm = it.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (!mm) return err("Invalid field declaration");
    fields.push(mm[1]);
  }
  return ok(fields);
}

function tryHandleProgramLet(
  ctx: _ProgramContext,
  stmt: string
): Result<{ lastExpr?: string }, string> | undefined {
  if (!stmt.startsWith("let ")) return undefined;
  const parsed = parseProgramLet(stmt);
  if (!parsed.ok) return err(parsed.error);

  if (parsed.value.name in ctx.vars) return err("Duplicate binding");

  const init = evalProgramInitializer(ctx, parsed.value.initExpr);
  if (!init.ok) return err(init.error);

  ctx.vars[parsed.value.name] = init.value;
  ctx.muts[parsed.value.name] = parsed.value.isMut;
  return ok({});
}

function parseProgramLet(
  stmt: string
): Result<{ name: string; isMut: boolean; initExpr: string }, string> {
  const rest = stmt.slice(4).trim();
  const eqIdx = rest.indexOf("=");
  if (eqIdx === -1) return err("Invalid let binding");
  const beforeEq = rest.slice(0, eqIdx).trim();
  let initExpr = rest.slice(eqIdx + 1).trim();
  if (initExpr.endsWith(";")) initExpr = initExpr.slice(0, -1).trim();
  const header = parseLetBindingHeader(beforeEq);
  if (!header.ok) return err(header.error);
  return ok({ name: header.value.name, isMut: header.value.isMut, initExpr });
}

function evalProgramInitializer(
  ctx: _ProgramContext,
  initExpr: string
): Result<_ProgramValue, string> {
  const cons = initExpr.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\{([^}]*)\}$/);
  if (!cons) return resolveExpression(initExpr, ctx.vars);
  const structName = cons[1];
  const valsStr = cons[2].trim();
  const fields = ctx.structDefs[structName];
  if (!fields) return err(`Unknown struct: ${structName}`);
  const vals = valsStr
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  if (vals.length !== fields.length) return err("Field count mismatch");
  const obj: Record<string, number> = {};
  for (let i = 0; i < fields.length; i++) {
    const v = resolveExpression(vals[i], ctx.vars);
    if (!v.ok) return err(v.error);
    obj[fields[i]] = v.value;
  }
  return ok(obj);
}

function tryHandleProgramAssignment(
  ctx: _ProgramContext,
  stmt: string
): Result<{ lastExpr?: string }, string> | undefined {
  const assign = stmt.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
  if (!assign) return undefined;
  const nm = assign[1];
  const rhs = assign[2].trim();
  if (!(nm in ctx.vars)) return err(`Unknown variable: ${nm}`);
  if (!ctx.muts[nm]) return err("Assignment to immutable variable");
  const resolved = resolveExpression(rhs, ctx.vars);
  if (!resolved.ok) return err(resolved.error);
  ctx.vars[nm] = resolved.value;
  return ok({});
}

function resolveExpression(
  expr: string,
  vars: Record<string, _ProgramValue>
): Result<number, string> {
  // Replace identifier.field and identifier with numeric values
  const idRe = /([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?/g;
  let out = expr;
  for (const m of expr.matchAll(idRe)) {
    const full = m[0];
    const name = m[1];
    const field = m[2];
    if (!(name in vars)) return err(`Unknown variable: ${name}`);
    const val = vars[name];
    if (field) {
      if (typeof val === "number") return err(`Not a struct: ${name}`);
      if (!Object.prototype.hasOwnProperty.call(val, field))
        return err(`Unknown field: ${field}`);
      out = out.replace(full, String(val[field]));
    } else {
      if (typeof val === "number") out = out.replace(full, String(val));
      else return err(`Cannot use struct value directly: ${name}`);
    }
  }
  const n = Number(out);
  if (Number.isFinite(n)) return ok(n);
  // If it's an expression, return evaluated value via interpret; but here we return the expression string as number isn't possible
  // To simplify, attempt to evaluate arithmetic via interpret
  const r = interpret(out);
  if (!r.ok) return err(r.error);
  return ok(r.value);
}

/* Complex evaluator removed to keep implementation minimal for the requested test case (simple a + b). */
