function isIdentifierChar(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_"
  );
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
          
          const funcNameStart = exportIndex + 16;
          let funcNameEnd = funcNameStart;
          while (
            funcNameEnd < code.length &&
            isIdentifierChar(code[funcNameEnd])
          ) {
            funcNameEnd++;
          }
          
          const funcName = code.slice(funcNameStart, funcNameEnd);
          const parenStart = code.indexOf("(", funcNameEnd);
          if (parenStart === -1) break;
          
          const parenEnd = code.indexOf(")", parenStart);
          if (parenEnd === -1) break;
          
          let funcEnd = -1;
          let funcBody = "";
          const afterParen = code.slice(parenEnd + 1).trim();
          
          if (afterParen.startsWith("=>")) {
            const arrowStart = code.indexOf("=>", parenEnd);
            const bodyStart = arrowStart + 2;
            let pos = bodyStart;
            while (pos < code.length && (code[pos] === " " || code[pos] === "\t")) pos++;
            
            if (code[pos] === "{") {
              let braceDepth = 1;
              funcEnd = pos + 1;
              while (funcEnd < code.length && braceDepth > 0) {
                if (code[funcEnd] === "{") braceDepth++;
                else if (code[funcEnd] === "}") braceDepth--;
                funcEnd++;
              }
              funcBody = code.slice(exportIndex + 7, funcEnd);
            } else {
              funcEnd = code.indexOf(";", pos);
              if (funcEnd === -1) funcEnd = code.length;
              else funcEnd++;
              funcBody = code.slice(exportIndex + 7, funcEnd);
            }
          } else {
            const bodyStart = code.indexOf("{", parenEnd);
            if (bodyStart === -1) break;
            
            let braceDepth = 1;
            funcEnd = bodyStart + 1;
            while (funcEnd < code.length && braceDepth > 0) {
              if (code[funcEnd] === "{") braceDepth++;
              else if (code[funcEnd] === "}") braceDepth--;
              funcEnd++;
            }
            funcBody = code.slice(exportIndex + 7, funcEnd);
          }
          
          if (funcBody) {
            try {
              const func = new Function(`return (${funcBody})`)();
              if (typeof func === "function") {
                nativeFunctions.set(funcName, func);
              }
            } catch (e) {
              throw new Error(`Failed to parse function ${funcName}: ${e}`);
            }
          }
          
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
