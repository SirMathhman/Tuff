import {
  isIdentifierChar,
  isWhitespace,
  matchWord,
} from "../../parsing/string-helpers";
import { parseModuleMemberWithPrivate } from "./module-member-parser";

interface ModuleRegion {
  name: string;
  type: "module" | "object";
  body: string;
  start: number;
  end: number;
}

export interface ModuleMetadata {
  name: string;
  type: "module" | "object";
  publicMembers: Set<string>;
  privateMembers: Set<string>;
}

function collectMembers(body: string): {
  publicMembers: string[];
  privateMembers: string[];
} {
  const publicMembers: string[] = [];
  const privateMembers: string[] = [];
  let i = 0;
  while (i < body.length) {
    i = skipWhitespace(body, i);
    if (i >= body.length) break;

    const result = parseModuleMemberWithPrivate(body, i);
    if (result) {
      if (result.memberName) {
        if (result.isPublic) {
          publicMembers.push(result.memberName);
        } else {
          privateMembers.push(result.memberName);
        }
      }
      i = result.endIdx;
    } else {
      while (i < body.length && body[i] !== ";") i++;
      if (i < body.length) i++;
    }
  }
  return { publicMembers, privateMembers };
}

function skipWhitespace(source: string, index: number): number {
  while (index < source.length && isWhitespace(source[index])) index++;
  return index;
}

export function findModuleRegions(source: string): ModuleRegion[] {
  const regions: ModuleRegion[] = [];
  let i = 0;
  while (i < source.length) {
    const isModule = matchWord(source, i, "module");
    const isObject = matchWord(source, i, "object");

    if (isModule || isObject) {
      const keyword = isModule ? "module" : "object";
      let j = i + keyword.length;
      j = skipWhitespace(source, j);

      const nameStart = j;
      while (j < source.length && isIdentifierChar(source[j])) j++;
      const name = source.slice(nameStart, j);
      j = skipWhitespace(source, j);

      if (j < source.length && source[j] === "{") {
        const bodyStart = j + 1;
        const bodyEnd = findMatchingBrace(source, j);
        const body = source.slice(bodyStart, bodyEnd - 1);
        regions.push({
          name,
          type: isModule ? "module" : "object",
          body,
          start: i,
          end: bodyEnd,
        });
        i = bodyEnd;
        continue;
      }
    }
    i++;
  }
  return regions;
}

function findMatchingBrace(source: string, start: number): number {
  let depth = 1;
  let i = start + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }
  return i;
}

export function collectModuleMetadata(source: string): ModuleMetadata[] {
  return findModuleRegions(source).map((region) => {
    const { publicMembers, privateMembers } = collectMembers(region.body);
    return {
      name: region.name,
      type: region.type,
      publicMembers: new Set(publicMembers),
      privateMembers: new Set(privateMembers),
    };
  });
}

function isIdentifierStartChar(ch: string): boolean {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    ch === "_"
  );
}

function readIdentifierBackward(source: string, index: number): string | undefined {
  let i = index - 1;
  while (i >= 0 && isWhitespace(source[i])) i--;
  if (i < 0 || !isIdentifierChar(source[i])) return undefined;
  const end = i;
  while (i >= 0 && isIdentifierChar(source[i])) i--;
  const start = i + 1;
  const startChar = source[start];
  if (!startChar || !isIdentifierStartChar(startChar)) return undefined;
  return source.slice(start, end + 1);
}

function readIdentifierForward(source: string, index: number): string | undefined {
  let i = index;
  while (i < source.length && isWhitespace(source[i])) i++;
  if (i >= source.length || !isIdentifierChar(source[i])) return undefined;
  const start = i;
  while (i < source.length && isIdentifierChar(source[i])) i++;
  const startChar = source[start];
  if (!startChar || !isIdentifierStartChar(startChar)) return undefined;
  return source.slice(start, i);
}

function skipQuotedString(source: string, index: number, quote: string): number {
  let i = index + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === quote) {
      return i + 1;
    }
    i++;
  }
  return i;
}

function skipLineComment(source: string, index: number): number {
  let i = index + 2;
  while (i < source.length && source[i] !== "\n") i++;
  return i;
}

function skipBlockComment(source: string, index: number): number {
  let i = index + 2;
  while (i < source.length) {
    if (source[i] === "*" && i + 1 < source.length && source[i + 1] === "/") {
      return i + 2;
    }
    i++;
  }
  return i;
}

export function validateModuleAccess(
  source: string,
  metadata: ModuleMetadata[],
): void {
  const moduleMap = new Map<string, ModuleMetadata>();
  const objectMap = new Map<string, ModuleMetadata>();
  for (const meta of metadata) {
    if (meta.type === "module") {
      moduleMap.set(meta.name, meta);
    } else {
      objectMap.set(meta.name, meta);
    }
  }

  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      i = skipQuotedString(source, i, ch);
      continue;
    }
    if (ch === "/" && i + 1 < source.length) {
      if (source[i + 1] === "/") {
        i = skipLineComment(source, i);
        continue;
      }
      if (source[i + 1] === "*") {
        i = skipBlockComment(source, i);
        continue;
      }
    }
    if (source[i] === ":" && source[i + 1] === ":") {
      const moduleName = readIdentifierBackward(source, i);
      const memberName = readIdentifierForward(source, i + 2);
      if (moduleName && memberName) {
        const moduleInfo = moduleMap.get(moduleName);
        if (!moduleInfo) {
          throw new Error(`module '${moduleName}' is not defined`);
        }
        if (!moduleInfo.publicMembers.has(memberName)) {
          if (moduleInfo.privateMembers.has(memberName)) {
            throw new Error(
              `member '${memberName}' of module '${moduleName}' is private`,
            );
          }
          throw new Error(
            `module '${moduleName}' has no member '${memberName}'`,
          );
        }
      }
      i += 2;
      continue;
    }
    if (source[i] === ".") {
      const objectName = readIdentifierBackward(source, i);
      const memberName = readIdentifierForward(source, i + 1);
      if (objectName && memberName) {
        const objectInfo = objectMap.get(objectName);
        if (objectInfo) {
          if (!objectInfo.publicMembers.has(memberName)) {
            if (objectInfo.privateMembers.has(memberName)) {
              throw new Error(
                `member '${memberName}' of object '${objectName}' is private`,
              );
            }
            throw new Error(
              `object '${objectName}' has no member '${memberName}'`,
            );
          }
        }
      }
    }
    i++;
  }
}
