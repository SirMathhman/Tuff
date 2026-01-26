import {
  isIdentifierChar,
  isWhitespace,
  matchWord,
  readIdentifier,
} from "../../parsing/string-helpers";
import { parseBracedBlock } from "../../parsing/parse-helpers";
import { scanModuleBody } from "./module-member-parser";

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
  scanModuleBody(body, (result) => {
    if (!result.memberName) return;
    if (result.isPublic) {
      publicMembers.push(result.memberName);
    } else {
      privateMembers.push(result.memberName);
    }
  });
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

      const parsedName = readIdentifier(source, j);
      const name = parsedName.name;
      j = parsedName.endIdx;
      j = skipWhitespace(source, j);

      if (j < source.length && source[j] === "{") {
        const { content: body, endIdx: bodyEnd } = parseBracedBlock(source, j);
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
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function readIdentifierBackward(
  source: string,
  index: number,
): string | undefined {
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

function readIdentifierForward(
  source: string,
  index: number,
): string | undefined {
  let i = index;
  while (i < source.length && isWhitespace(source[i])) i++;
  if (i >= source.length || !isIdentifierChar(source[i])) return undefined;
  const start = i;
  while (i < source.length && isIdentifierChar(source[i])) i++;
  const startChar = source[start];
  if (!startChar || !isIdentifierStartChar(startChar)) return undefined;
  return source.slice(start, i);
}

function skipQuotedString(
  source: string,
  index: number,
  quote: string,
): number {
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

function validateModuleMemberAccess(
  moduleName: string | undefined,
  memberName: string | undefined,
  moduleMap: Map<string, ModuleMetadata>,
): void {
  if (!moduleName || !memberName) return;
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
    throw new Error(`module '${moduleName}' has no member '${memberName}'`);
  }
}

function validateObjectMemberAccess(
  objectName: string | undefined,
  memberName: string | undefined,
  objectMap: Map<string, ModuleMetadata>,
): void {
  if (!objectName || !memberName) return;
  const objectInfo = objectMap.get(objectName);
  if (objectInfo) {
    if (!objectInfo.publicMembers.has(memberName)) {
      if (objectInfo.privateMembers.has(memberName)) {
        throw new Error(
          `member '${memberName}' of object '${objectName}' is private`,
        );
      }
      throw new Error(`object '${objectName}' has no member '${memberName}'`);
    }
  }
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
      validateModuleMemberAccess(moduleName, memberName, moduleMap);
      i += 2;
      continue;
    }
    if (source[i] === ".") {
      const objectName = readIdentifierBackward(source, i);
      const memberName = readIdentifierForward(source, i + 1);
      validateObjectMemberAccess(objectName, memberName, objectMap);
    }
    i++;
  }
}
