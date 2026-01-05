import { Result, ok, err } from "./result";
import { interpret } from "./interpret";
import { findMatchingBrace, findSemicolonAtDepthZero } from "./utils";
import { parseLetBindingHeader } from "./bindings";

export type _ProgramValue = number | Record<string, number>;

export type _ProgramContext = {
  structDefs: Record<string, string[]>;
  vars: Record<string, _ProgramValue>;
  muts: Record<string, boolean>;
  typeAliases: Record<string, string>;
};

export function parseTopLevelStatements(input: string): string[] | undefined {
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

export function evalProgram(stmts: string[]): Result<number, string> {
  const ctx: _ProgramContext = {
    structDefs: {},
    vars: {},
    muts: {},
    typeAliases: {},
  };
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
  // Handle `expr is Type` predicates directly in program context
  const isMatch = lastExpr.match(
    /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s+is\s+([A-Za-z_][A-Za-z0-9_]*)$/i
  );
  if (isMatch) {
    const lhs = isMatch[1];
    const typeName = isMatch[2];
    const isRes = evaluateIsExpression(ctx, lhs, typeName);
    if (!isRes.ok) return err(isRes.error);
    if (isRes.value) return ok(1);
    return ok(0);
  }

  return resolveExpression(lastExpr, ctx.vars);
}

function evalProgramStatement(
  ctx: _ProgramContext,
  stmt: string
): Result<{ lastExpr?: string }, string> {
  const typeRes = tryHandleProgramTypeAlias(ctx, stmt);
  if (typeRes) return typeRes;

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

function tryHandleProgramTypeAlias(
  ctx: _ProgramContext,
  stmt: string
): Result<{ lastExpr?: string }, string> | undefined {
  if (!stmt.startsWith("type ")) return undefined;
  const m = stmt.match(
    /^type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/i
  );
  if (!m) return err("Invalid type alias");
  const name = m[1];
  const target = m[2];
  if (name in ctx.typeAliases) return err("Duplicate binding");
  if (name in ctx.structDefs) return err("Duplicate binding");
  if (name in ctx.vars) return err("Duplicate binding");
  ctx.typeAliases[name] = target;
  return ok({});
}
function tryHandleProgramLet(
  ctx: _ProgramContext,
  stmt: string
): Result<{ lastExpr?: string }, string> | undefined {
  if (!stmt.startsWith("let ")) return undefined;
  const parsed = parseProgramLet(stmt);
  if (!parsed.ok) return err(parsed.error);

  if (parsed.value.name in ctx.vars) return err("Duplicate binding");
  if (parsed.value.name in ctx.structDefs) return err("Duplicate binding");
  if (parsed.value.name in ctx.typeAliases) return err("Duplicate binding");

  const init = evalProgramInitializer(ctx, parsed.value.initExpr);
  if (!init.ok) return err(init.error);

  // apply type alias resolution and simple bool normalization
  let finalVal = init.value;
  if (parsed.value.type) {
    const resolved = resolveTypeAlias(ctx, parsed.value.type);
    if (!resolved.ok) return err(resolved.error);
    const target = resolved.value;
    if (target.toLowerCase() === "bool") {
      if (typeof finalVal === "number") {
        if (finalVal !== 0) finalVal = 1;
        else finalVal = 0;
      }
    }
  }

  ctx.vars[parsed.value.name] = finalVal;
  ctx.muts[parsed.value.name] = parsed.value.isMut;
  return ok({});
}

function parseProgramLet(
  stmt: string
): Result<
  { name: string; isMut: boolean; initExpr: string; type?: string },
  string
> {
  const rest = stmt.slice(4).trim();
  const eqIdx = rest.indexOf("=");
  if (eqIdx === -1) return err("Invalid let binding");
  const beforeEq = rest.slice(0, eqIdx).trim();
  let initExpr = rest.slice(eqIdx + 1).trim();
  if (initExpr.endsWith(";")) initExpr = initExpr.slice(0, -1).trim();

  const header = parseLetBindingHeader(beforeEq);
  if (!header.ok) return err(header.error);
  return ok({
    name: header.value.name,
    isMut: header.value.isMut,
    initExpr,
    type: header.value.type,
  });
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

function resolveTypeAlias(
  ctx: _ProgramContext,
  name: string
): Result<string, string> {
  let target = name;
  const visited: Set<string> = new Set();
  while (ctx.typeAliases[target]) {
    if (visited.has(target)) return err("Cyclic type alias");
    visited.add(target);
    target = ctx.typeAliases[target];
  }
  return ok(target);
}

function resolveLhsValue(
  ctx: _ProgramContext,
  lhs: string
): Result<number | Record<string, number>, string> {
  const parts = lhs.split(".");
  const name = parts[0];
  if (!(name in ctx.vars)) return err(`Unknown variable: ${name}`);
  const val = ctx.vars[name];
  if (parts.length === 1) return ok(val);
  // field access
  if (typeof val === "number") return err(`Not a struct: ${name}`);
  const field = parts[1];
  if (!Object.prototype.hasOwnProperty.call(val, field))
    return err(`Unknown field: ${field}`);
  const valObj = val;
  return ok(valObj[field]);
}

function evaluateIsExpression(
  ctx: _ProgramContext,
  lhs: string,
  typeName: string
): Result<boolean, string> {
  const tgt = resolveTypeAlias(ctx, typeName);
  if (!tgt.ok) return err(tgt.error);
  const target = tgt.value;

  const lhsVal = resolveLhsValue(ctx, lhs);
  if (!lhsVal.ok) return err(lhsVal.error);
  const value = lhsVal.value;

  // Primitive types
  if (target.toLowerCase() === "i32" || target.toLowerCase() === "i64") {
    return ok(typeof value === "number");
  }
  if (target.toLowerCase() === "bool") {
    return ok(typeof value === "number" && (value === 0 || value === 1));
  }

  // Struct type
  const structFields = ctx.structDefs[target];
  if (!structFields) return err(`Unknown type: ${typeName}`);
  if (typeof value === "number") return ok(false);
  for (const f of structFields) {
    if (!Object.prototype.hasOwnProperty.call(value, f)) return ok(false);
  }
  return ok(true);
}
export function resolveExpression(
  expr: string,
  vars: Record<string, _ProgramValue>
): Result<number, string> {
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
  const r = interpret(out);
  if (!r.ok) return err(r.error);
  return ok(r.value);
}
