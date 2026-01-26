import { compile } from "./compiler";
import { isIdentifierChar } from "./parsing/string-helpers";

function stripEsmExports(js: string): string {
  return js
    .split("export function ")
    .join("function ")
    .split("export const ")
    .join("const ")
    .split("export let ")
    .join("let ")
    .split("export var ")
    .join("var ")
    .split("export ")
    .join("");
}

function parseModuleRefStatement(
  stmt: string,
): { alias: string; moduleName: string } | undefined {
  const trimmed = stmt.trim();
  if (!trimmed.startsWith("let ")) return undefined;
  const fromIndex = trimmed.indexOf(" from ");
  if (fromIndex === -1) return undefined;

  const alias = trimmed.slice(4, fromIndex).trim();
  if (!alias) return undefined;

  let j = fromIndex + 6;
  while (j < trimmed.length && (trimmed[j] === " " || trimmed[j] === "\t")) {
    j++;
  }

  const nameStart = j;
  while (j < trimmed.length && isIdentifierChar(trimmed[j])) j++;
  const moduleName = trimmed.slice(nameStart, j);
  if (!moduleName) return undefined;

  return { alias, moduleName };
}

function rewriteModuleRefAccess(
  code: string,
  moduleRefs: Map<string, string>,
): string {
  if (moduleRefs.size === 0) return code;

  let result = "";
  let i = 0;

  while (i < code.length) {
    const ch = code[i];
    if (isIdentifierChar(ch) && (i === 0 || !isIdentifierChar(code[i - 1]))) {
      const start = i;
      i++;
      while (i < code.length && isIdentifierChar(code[i])) i++;
      const word = code.slice(start, i);

      if (!moduleRefs.has(word)) {
        result += word;
        continue;
      }

      let j = i;
      while (j < code.length && (code[j] === " " || code[j] === "\t")) j++;
      if (j < code.length && code[j] === ".") {
        i = j + 1;
        continue;
      }

      result += word;
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

function normalizeTuffForCompileAll(p: {
  source: string;
  moduleRefs?: Map<string, string>;
}): { cleaned: string; moduleRefs: Map<string, string> } {
  const moduleRefs = p.moduleRefs ?? new Map<string, string>();
  const parts = p.source.split(";");
  const kept: Array<{ text: string; needsSemicolon: boolean }> = [];

  for (const raw of parts) {
    const stmt = raw.trim();
    if (!stmt) continue;

    const moduleRef = parseModuleRefStatement(stmt);
    if (moduleRef) {
      moduleRefs.set(moduleRef.alias, moduleRef.moduleName);
      continue;
    }

    if (stmt.startsWith("extern ")) {
      const rest = stmt.slice(7).trim();
      if (rest.startsWith("use ")) continue;
      if (rest.startsWith("fn ")) continue;
      kept.push({ text: rest, needsSemicolon: true });
      continue;
    }

    if (stmt.startsWith("use ")) continue;

    if (stmt.startsWith("out ")) {
      const stripped = stmt.slice(4).trim();
      kept.push({
        text: stripped,
        needsSemicolon: !stripped.startsWith("struct "),
      });
      continue;
    }

    kept.push({ text: stmt, needsSemicolon: !stmt.startsWith("struct ") });
  }

  let rebuilt = "";
  for (const k of kept) {
    rebuilt += k.text;
    rebuilt += k.needsSemicolon ? "; " : " ";
  }

  return {
    cleaned: rewriteModuleRefAccess(rebuilt.trim(), moduleRefs),
    moduleRefs,
  };
}

/**
 * Compile a multi-module Tuff program with module resolution.
 *
 * Today this is intentionally minimal: it supports the `interpretAll` test shape where
 * each module is provided as a standalone source string that may contain `out` members,
 * `use ... from ...;` imports, and `let alias from module;` references.
 */
export function compileAll(
  entry: string[],
  sourceMap: Map<string[], string>,
  nativeMap?: Map<string[], string>,
): string {
  const entryName = entry[0];
  if (!entryName) return "";

  function findModuleConfig(moduleName: string): string | undefined {
    for (const [key, value] of sourceMap.entries()) {
      if (key.length === 1 && key[0] === moduleName) return value;
    }
    return undefined;
  }

  const mainSource = findModuleConfig(entryName);
  if (!mainSource) return "";

  const normalizedMain = normalizeTuffForCompileAll({ source: mainSource });

  const modulePieces: string[] = [];
  for (const [key, value] of sourceMap.entries()) {
    const moduleName = key[0];
    if (!moduleName) continue;
    if (moduleName === entryName) continue;

    const normalized = normalizeTuffForCompileAll({
      source: value,
      moduleRefs: normalizedMain.moduleRefs,
    });

    if (normalized.cleaned.trim()) modulePieces.push(normalized.cleaned);
  }

  const combinedTuff =
    "0;\n" + modulePieces.join("\n") + "\n" + normalizedMain.cleaned;
  const compiled = compile(combinedTuff);

  const nativePrelude: string[] = [];
  if (nativeMap) {
    for (const [, js] of nativeMap.entries()) {
      nativePrelude.push(stripEsmExports(js));
    }
  }

  return nativePrelude.length > 0
    ? nativePrelude.join("\n") + "\n" + compiled
    : compiled;
}
