import { isIdentifierChar, isWhitespace, matchWord } from "../parsing/string-helpers";
import { parseModuleMemberWithPrivate } from "./helpers/module-member-parser";

function skipWhitespace(source: string, index: number): number {
  while (index < source.length && isWhitespace(source[index])) index++;
  return index;
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

/**
 * Replace variable references in member definitions with a new name
 */
function replaceVariableInMembers(
  members: string,
  oldName: string,
  newName: string,
): string {
  let result = "";
  let i = 0;
  while (i < members.length) {
    if (
      isIdentifierChar(members[i]) &&
      (i === 0 || !isIdentifierChar(members[i - 1]))
    ) {
      const start = i;
      while (i < members.length && isIdentifierChar(members[i])) i++;
      const word = members.slice(start, i);
      result += word === oldName ? newName : word;
    } else {
      result += members[i];
      i++;
    }
  }
  return result;
}

function transformModuleBody(body: string): {
  publicMembers: string;
  privateVars: Array<{ name: string; value: string }>;
} {
  const members: string[] = [];
  const privateVars: Array<{ name: string; value: string }> = [];
  let i = 0;
  while (i < body.length) {
    i = skipWhitespace(body, i);
    if (i >= body.length) break;

    const result = parseModuleMemberWithPrivate(body, i);
    if (result) {
      if (result.js) members.push(result.js);
      if (result.privateVar) privateVars.push(result.privateVar);
      i = result.endIdx;
    } else {
      while (i < body.length && body[i] !== ";") i++;
      if (i < body.length) i++;
    }
  }
  return { publicMembers: members.join(", "), privateVars };
}

/**
 * Transform module declarations to JS objects
 */
export function transformModules(source: string): string {
  let result = "";
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
        const { publicMembers, privateVars } = transformModuleBody(body);

        let transformedMembers = publicMembers;
        for (const pv of privateVars) {
          const prefixedName = `_${name}_${pv.name}`;
          result += `let ${prefixedName} = ${pv.value}; `;
          transformedMembers = replaceVariableInMembers(
            transformedMembers,
            pv.name,
            prefixedName,
          );
        }

        result += `${name} = { ${transformedMembers} };`;
        i = bodyEnd;
        continue;
      }
    }

    result += source[i];
    i++;
  }

  return result;
}

/**
 * Transform module access :: to dot notation
 */
export function transformModuleAccess(source: string): string {
  let result = "";
  let i = 0;

  while (i < source.length) {
    if (source.slice(i, i + 2) === "::") {
      result += ".";
      i += 2;
    } else {
      result += source[i];
      i++;
    }
  }

  return result;
}
