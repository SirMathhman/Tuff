import { isIdentifierChar } from "../char-utils";

function extractFunctionName(code: string, exportIndex: number): string {
  const funcNameStart = exportIndex + 16;
  let funcNameEnd = funcNameStart;
  while (funcNameEnd < code.length && isIdentifierChar(code[funcNameEnd])) {
    funcNameEnd++;
  }
  return code.slice(funcNameStart, funcNameEnd);
}

function findFunctionParameters(
  code: string,
  funcNameEnd: number,
): { parenStart: number; parenEnd: number } | undefined {
  const parenStart = code.indexOf("(", funcNameEnd);
  if (parenStart === -1) return undefined;
  const parenEnd = code.indexOf(")", parenStart);
  if (parenEnd === -1) return undefined;
  return { parenStart, parenEnd };
}

function extractArrowFunctionBody(code: string, parenEnd: number): string {
  const arrowStart = code.indexOf("=>", parenEnd);
  const bodyStart = arrowStart + 2;
  let pos = bodyStart;
  while (pos < code.length && (code[pos] === " " || code[pos] === "\t")) pos++;
  if (code[pos] === "{") {
    let braceDepth = 1;
    let funcEnd = pos + 1;
    while (funcEnd < code.length && braceDepth > 0) {
      if (code[funcEnd] === "{") braceDepth++;
      else if (code[funcEnd] === "}") braceDepth--;
      funcEnd++;
    }
    return code.slice(arrowStart - 8, funcEnd);
  } else {
    let funcEnd = code.indexOf(";", pos);
    if (funcEnd === -1) funcEnd = code.length;
    else funcEnd++;
    return code.slice(arrowStart - 8, funcEnd);
  }
}

function extractRegularFunctionBody(
  code: string,
  exportIndex: number,
  parenEnd: number,
): string {
  const bodyStart = code.indexOf("{", parenEnd);
  if (bodyStart === -1) return "";
  let braceDepth = 1;
  let funcEnd = bodyStart + 1;
  while (funcEnd < code.length && braceDepth > 0) {
    if (code[funcEnd] === "{") braceDepth++;
    else if (code[funcEnd] === "}") braceDepth--;
    funcEnd++;
  }
  return code.slice(exportIndex + 7, funcEnd);
}

function parseFunction(
  code: string,
  exportIndex: number,
):
  | {
      funcName: string;
      func: (...args: number[]) => number;
      funcEnd: number;
    }
  | undefined {
  const funcName = extractFunctionName(code, exportIndex);
  const params = findFunctionParameters(
    code,
    exportIndex + 16 + funcName.length,
  );
  if (!params) return undefined;
  const afterParen = code.slice(params.parenEnd + 1).trim();
  let funcBody = "";
  let funcEnd = -1;
  if (afterParen.startsWith("=>")) {
    funcBody = extractArrowFunctionBody(code, params.parenEnd);
    funcEnd = params.parenEnd + funcBody.length + 8;
  } else {
    funcBody = extractRegularFunctionBody(code, exportIndex, params.parenEnd);
    funcEnd = exportIndex + 7 + funcBody.length;
  }
  if (funcBody) {
    try {
      const func = new Function(`return (${funcBody})`)() as (
        ...args: number[]
      ) => number;
      if (typeof func === "function") {
        return { funcName, func, funcEnd };
      }
    } catch (e) {
      throw new Error(`Failed to parse function ${funcName}: ${e}`);
    }
  }
  return undefined;
}

export function parseNativeModules(
  nativeConfig: Map<string[], string>,
): Map<string, (...args: number[]) => number> {
  const nativeFunctions = new Map<string, (...args: number[]) => number>();
  for (const [key, code] of nativeConfig.entries()) {
    const moduleName = key[0];
    if (moduleName) {
      try {
        let searchPos = 0;
        while (searchPos < code.length) {
          const exportIndex = code.indexOf("export function ", searchPos);
          if (exportIndex === -1) break;
          const parsed = parseFunction(code, exportIndex);
          if (!parsed) break;
          const { funcName, func, funcEnd } = parsed;
          nativeFunctions.set(funcName, func);
          searchPos = funcEnd;
        }
      } catch (e) {
        throw new Error(`Failed to load native module ${moduleName}: ${e}`);
      }
    }
  }
  return nativeFunctions;
}

export function installNativeFunctions(
  nativeFunctions: Map<string, (...args: number[]) => number>,
): string[] {
  const names: string[] = [];
  if (typeof globalThis !== "undefined") {
    for (const [name, func] of nativeFunctions.entries()) {
      (globalThis as Record<string, unknown>)[`__native__${name}`] = func;
      names.push(name);
    }
  }
  return names;
}

export function cleanupNativeFunctions(names: string[]): void {
  if (typeof globalThis !== "undefined") {
    for (const name of names) {
      delete (globalThis as Record<string, unknown>)[`__native__${name}`];
    }
  }
}
