import type { ParsedArrayType, VarDeclaration } from "./types";

function splitArrayTypeInner(typeInner: string): string[] {
  return typeInner
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseArrayDeclaredSize(typeInner: string): number | undefined {
  const parts = splitArrayTypeInner(typeInner);
  if (parts.length < 2) return undefined;
  const maybeSize = parts[1];
  return /^\d+$/.test(maybeSize) ? parseInt(maybeSize, 10) : undefined;
}

function parseArrayRuntimeSize(typeInner: string): number | undefined {
  const parts = splitArrayTypeInner(typeInner);
  if (parts.length < 3) return undefined;
  const maybeSize = parts[2];
  return /^\d+$/.test(maybeSize) ? parseInt(maybeSize, 10) : undefined;
}

function defaultValForArrayElemType(t: string): string {
  const ty = t.trim();
  if (
    ty === "I32" ||
    ty === "ISize" ||
    ty === "USize" ||
    ty === "Bool" ||
    ty === "Char"
  )
    return "0";
  return "undefined";
}

function parseBracketArrayType(
  typeSpec: string | undefined
): ParsedArrayType | undefined {
  if (!typeSpec) return undefined;
  const t = typeSpec.trim();
  if (!t.startsWith("[")) return undefined;
  const inner = t.replace(/^\[|\]$/g, "");
  const parts = splitArrayTypeInner(inner);
  return { inner, parts };
}

function parseInitializerItems(initInner: string): string[] {
  return initInner
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function checkItemsLength(
  name: string,
  expected: number,
  initInner: string
): string | undefined {
  const items = parseInitializerItems(initInner);
  if (items.length !== expected) {
    return `(function(){ throw new Error("array initializer length mismatch for '${name}': expected ${expected} but got ${items.length}"); })()`;
  }
  return undefined;
}

export function checkArrayInitializersInDecls(
  src: string,
  decls: Map<string, VarDeclaration>
): string | undefined {
  for (const [name, info] of decls.entries()) {
    const parsed = parseBracketArrayType(info.type);
    if (!parsed) continue;
    // parse bracket content split by semicolon: [Type; size; ...]
    const { inner } = parsed;
    const expected = parseArrayDeclaredSize(inner);
    if (expected === undefined) continue;

    // Manually find initializer bracket after the declaration to avoid regex pitfalls
    let startIdx = src.indexOf("let " + name);
    while (startIdx !== -1) {
      const eqIdx = src.indexOf("=", startIdx);
      if (eqIdx === -1) break;
      const brOpen = src.indexOf("[", eqIdx);
      if (brOpen === -1) break;
      // find closing bracket
      const brClose = src.indexOf("]", brOpen + 1);
      if (brClose === -1) break;
      const innerInit = src.slice(brOpen + 1, brClose);
      const maybeErr = checkItemsLength(name, expected, innerInit);
      if (maybeErr) return maybeErr;
      startIdx = src.indexOf("let " + name, brClose);
    }
  }
  return undefined;
}

export function checkExplicitArrayDecls(src: string): string | undefined {
  const re =
    /\blet\s+(?:mut\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*\[([^\]]+)\]\s*=\s*\[([^\]]*)\]/g;
  let m: RegExpExecArray | undefined;
  while ((m = re.exec(src) as RegExpExecArray | undefined)) {
    const name = m[1];
    const typeInner = (m[2] || "").trim();
    const initInner = m[3] || "";
    const expected = parseArrayDeclaredSize(typeInner);
    if (expected === undefined) continue;
    const maybeErr = checkItemsLength(name, expected, initInner);
    if (maybeErr) return maybeErr;
  }
  return undefined;
}

function padArrayInitializerInString(
  out: string,
  name: string,
  runtimeSize: number,
  elemType: string
): string {
  const padInner = (initInner: string): string | undefined => {
    const items = parseInitializerItems(initInner || "");
    const pad = Math.max(0, runtimeSize - items.length);
    if (pad === 0) return undefined;
    const def = defaultValForArrayElemType(elemType);
    const fill = Array(pad).fill(def).join(", ");
    return initInner.trim() === "" ? fill : initInner + ", " + fill;
  };

  const padReplace = (
    _m: string,
    open: string,
    initInner: string,
    close: string
  ): string => {
    const padded = padInner(initInner);
    const nextInner = padded ?? initInner;
    return `${open}${nextInner}${close}`;
  };

  const initRe = new RegExp(
    "(\\blet\\s+(?:mut\\s+)?" +
      name +
      "\\s*:\\s*\\[[^\\]]+\\]\\s*=\\s*\\[)([^\\]]*)(\\])"
  );
  if (initRe.test(out)) {
    return out.replace(initRe, padReplace);
  }

  const strippedInitRe = new RegExp(
    "(\\blet\\s+(?:mut\\s+)?" + name + "\\s*=\\s*\\[)([^\\]]*)(\\])"
  );
  if (strippedInitRe.test(out)) {
    return out.replace(strippedInitRe, padReplace);
  }

  return out;
}

export function initializeArrayDecls(
  src: string,
  declsMap: Map<string, VarDeclaration>
): string {
  let out = src;
  for (const [name, info] of declsMap.entries()) {
    const parsed = parseBracketArrayType(info.type);
    if (!parsed) continue;
    const { inner, parts } = parsed;
    if (parts.length < 3) continue;
    const elemType = parts[0] || "";
    const runtimeSize = parseArrayRuntimeSize(inner);
    if (runtimeSize === undefined) continue;

    const newOut = padArrayInitializerInString(
      out,
      name,
      runtimeSize,
      elemType
    );
    if (newOut !== out) {
      out = newOut;
      continue;
    }

    const def = defaultValForArrayElemType(elemType);
    const fill = Array(runtimeSize).fill(def).join(", ");
    // Replace `let [mut] name : [..];` with `let [mut] name : [..] = [<fill>];`
    const declRe = new RegExp(
      "(\\blet\\s+(?:mut\\s+)?" + name + "\\s*:\\s*\\[[^\\]]+\\])\\s*;"
    );
    out = out.replace(declRe, (_m, declPart) => `${declPart} = [${fill}];`);
  }
  return out;
}
