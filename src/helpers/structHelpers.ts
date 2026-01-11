import type { Result } from "../helpers/result";
import type { Binding } from "./types";
import { substituteAllIdents } from "../parsers/interpretHelpers";
import { findMatchingBraceIndex } from "../control/matchHelpers";
import { parseArgsList } from "./functionHelpers";

export interface FieldDecl {
  name: string;
  ann?: string;
}

const structDefs = new Map<string, FieldDecl[]>();

export function registerStruct(name: string, fields: FieldDecl[]): Result<void, string> {
  if (structDefs.has(name)) return { ok: false, error: "duplicate declaration" };
  structDefs.set(name, fields);
  return { ok: true, value: undefined };
}

export function lookupStruct(name: string): Result<FieldDecl[], string> {
  const v = structDefs.get(name);
  if (!v) return { ok: false, error: `unknown struct ${name}` };
  return { ok: true, value: v };
}

export function clearStructsForTests(): void {
  structDefs.clear();
}

export interface ParseStructDeclValue {
  name: string;
  fields: FieldDecl[];
  rest: string;
}

function splitTopLevelCommaParts(inner: string): string[] {
  // reuse parser from function helpers
  return parseArgsList(inner);
}

export interface IdentScan { name: string; nextPos: number }

function extractIdentAtStart(t: string): IdentScan | undefined {
  let p = 0;
  while (p < t.length && t[p] === " ") p++;
  const start = p;
  while (p < t.length) {
    const cc = t.charCodeAt(p);
    const ok =
      (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 95 || (cc >= 48 && cc <= 57);
    if (!ok) break;
    p++;
  }
  if (p === start) return undefined;
  const name = t.slice(start, p).trim();
  return { name, nextPos: p };
}

// Parse a struct declaration text like "struct Name { ... } rest"
export function parseStructDeclText(
  t: string
): Result<ParseStructDeclValue, string> {
  if (!t.startsWith("struct ")) return { ok: false, error: "invalid struct declaration" };
  const ident = extractIdentAtStart(t.slice(6));
  if (!ident) return { ok: false, error: "invalid struct declaration" };
  const name = ident.name;
  let i = 6 + ident.nextPos;
  while (i < t.length && t[i] === " ") i++;
  if (i >= t.length || t[i] !== "{") return { ok: false, error: "invalid struct declaration" };

  const j = findMatchingBraceIndex(t, i);
  if (j === -1) return { ok: false, error: "unmatched brace in struct declaration" };
  const rest = t.slice(j + 1).trim();

  const inner = t.slice(i + 1, j);

  const parts = splitTopLevelCommaParts(inner);

  const fields: FieldDecl[] = [];
  for (const p of parts) {
    if (!p) continue;
    const colon = p.indexOf(":");
    if (colon === -1) return { ok: false, error: "invalid struct field" };
    const fname = p.slice(0, colon).trim();
    const fann = p.slice(colon + 1).trim();
    if (!fname) return { ok: false, error: "invalid struct field" };
    fields.push({ name: fname, ann: fann });
  }

  return { ok: true, value: { name, fields, rest } };
}

// Parse and evaluate a struct initializer `Type { x : expr, ... }`
export function parseStructInitializer(
  t: string,
  env: Map<string, Binding>,
  evaluateBlockFn: (
    s: string,
    parentEnv?: Map<string, Binding>
  ) => Result<number, string>
): Result<Binding, string> | undefined {
  const ident = extractIdentAtStart(t);
  if (!ident) return undefined;
  const typeName = ident.name;
  let j = ident.nextPos;
  while (j < t.length && t[j] === " ") j++;
  if (!(j < t.length && t[j] === "{")) return undefined;

  const i = findMatchingBraceIndex(t, j);
  if (i === -1) return { ok: false, error: "unmatched brace in initializer" };
  const rest = t.slice(i + 1).trim();
  if (rest.length !== 0) return { ok: false, error: "unexpected tokens after struct initializer" };

  // parse fields inside
  const inner = t.slice(j + 1, i);
  const parts = splitTopLevelCommaParts(inner);

  // ensure struct type exists
  const sres = lookupStruct(typeName);
  if (!sres.ok) return { ok: false, error: sres.error };
  const fieldDefs = sres.value;
  const fieldSet = new Set(fieldDefs.map((f) => f.name));

  // evaluate each field initializer
  const fields = new Map<string, Binding>();
  for (const p of parts) {
    if (!p) continue;
    const colon = p.indexOf(":");
    if (colon === -1) return { ok: false, error: "invalid struct field initializer" };
    const fname = p.slice(0, colon).trim();
    if (!fieldSet.has(fname)) return { ok: false, error: `unknown field ${fname}` };
    const fexpr = p.slice(colon + 1).trim();
    const fsub = substituteAllIdents(fexpr, env);
    if (!fsub.ok) return { ok: false, error: fsub.error };
    const fres = evaluateBlockFn(fsub.value, env);
    if (!fres.ok) return { ok: false, error: fres.error };
    fields.set(fname, { value: fres.value });
  }

  // return a binding containing the struct value
  const binding: Binding = { value: 0, assigned: true, struct: { typeName, fields } };
  return { ok: true, value: binding };
}


