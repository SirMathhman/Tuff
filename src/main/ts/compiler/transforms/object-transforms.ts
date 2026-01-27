import { isIdentifierChar } from "../parsing/string-helpers";
import { findMatchingCloseBrace } from "../../utils/helpers/brace-utils";

interface ObjectRegion {
  start: number;
  end: number;
  name: string;
  body: string;
}

/**
 * Find all object declarations in the source code
 */
function findObjectRegions(source: string): ObjectRegion[] {
  const regions: ObjectRegion[] = [];
  let i = 0;
  while (i < source.length) {
    if (
      source.slice(i, i + 6) === "object" &&
      (i === 0 || !isIdentifierChar(source[i - 1]))
    ) {
      let j = i + 6;
      // Skip whitespace
      while (j < source.length && source[j] === " ") j++;
      // Extract object name
      const nameStart = j;
      while (j < source.length && isIdentifierChar(source[j])) j++;
      const name = source.slice(nameStart, j);
      // Skip whitespace
      while (j < source.length && source[j] === " ") j++;
      // Find opening brace
      if (j < source.length && source[j] === "{") {
        const braceStart = j;
        const braceEnd = findMatchingCloseBrace(source, braceStart);
        if (braceEnd !== -1) {
          const body = source.slice(braceStart + 1, braceEnd);
          regions.push({
            start: i,
            end: braceEnd + 1,
            name,
            body,
          });
          i = braceEnd + 1;
          continue;
        }
      }
    }
    i++;
  }
  return regions;
}

/**
 * Extract public field and method names from object body
 */
function extractObjectMembers(body: string): Set<string> {
  const members = new Set<string>();
  let i = 0;
  while (i < body.length) {
    // Skip to 'out' keyword
    if (
      body.slice(i, i + 3) === "out" &&
      (i === 0 || !isIdentifierChar(body[i - 1]))
    ) {
      i += 3;
      while (i < body.length && body[i] === " ") i++;
      // Extract name for either 'let' or 'fn' declarations
      let skipKeywordLen = 0;
      if (body.slice(i, i + 3) === "let") {
        skipKeywordLen = 3;
      } else if (body.slice(i, i + 2) === "fn") {
        skipKeywordLen = 2;
      } else {
        i++;
        continue;
      }
      
      i += skipKeywordLen;
      while (i < body.length && body[i] === " ") i++;
      // Skip 'mut' keyword if present (for let declarations)
      if (body.slice(i, i + 3) === "mut") {
        i += 3;
        while (i < body.length && body[i] === " ") i++;
      }
      // Extract the member name
      const nameStart = i;
      while (i < body.length && isIdentifierChar(body[i])) i++;
      const memberName = body.slice(nameStart, i);
      if (memberName) members.add(memberName);
    } else {
      i++;
    }
  }
  return members;
}

/**
 * Qualify field references in a function body with the object name
 */
function qualifyFieldReferencesInMethod(
  method: string,
  objectName: string,
  fieldNames: Set<string>,
): string {
  let result = "";
  let i = 0;
  while (i < method.length) {
    if (isIdentifierChar(method[i]) && (i === 0 || !isIdentifierChar(method[i - 1]))) {
      const start = i;
      while (i < method.length && isIdentifierChar(method[i])) i++;
      const word = method.slice(start, i);
      // Check if this identifier is a field name (but not if it's already qualified)
      if (fieldNames.has(word)) {
        const beforeWord = result.trimEnd();
        // Don't qualify if already qualified or if it's a function parameter
        if (beforeWord.endsWith(".") || beforeWord.endsWith("=>")) {
          result += word;
        } else {
          result += `${objectName}.${word}`;
        }
      } else {
        result += word;
      }
    } else {
      result += method[i];
      i++;
    }
  }
  return result;
}

/**
 * Transform object declarations so method bodies properly reference object fields
 * This handles qualifying field references in methods so they work in JavaScript closures
 */
export function transformObjects(source: string): string {
  const objectRegions = findObjectRegions(source);
  if (objectRegions.length === 0) {
    return source; // No objects to transform
  }
  
  let result = "";
  let cursor = 0;

  for (const objectRegion of objectRegions) {
    result += source.slice(cursor, objectRegion.start);
    
    // Extract public members from object body
    const fieldNames = extractObjectMembers(objectRegion.body);
    
    // Transform method bodies to qualify field references in each method
    let qualifiedBody = objectRegion.body;
    let searchIdx = 0;
    while (searchIdx < qualifiedBody.length) {
      const methodIdx = qualifiedBody.indexOf("fn ", searchIdx);
      if (methodIdx === -1) break;
      
      // Verify this is a method definition (not part of a larger word)
      if (methodIdx > 0 && isIdentifierChar(qualifiedBody[methodIdx - 1])) {
        searchIdx = methodIdx + 3;
        continue;
      }
      
      // Find the method body (after => operator)
      const arrowIdx = qualifiedBody.indexOf("=>", methodIdx);
      if (arrowIdx === -1) break;
      
      // Find where the method body ends (at semicolon or end of body)
      let endIdx = arrowIdx + 2;
      let bodyDepth = 0;
      while (endIdx < qualifiedBody.length) {
        const ch = qualifiedBody[endIdx];
        if (ch === "{") bodyDepth++;
        else if (ch === "}") bodyDepth--;
        else if (ch === ";" && bodyDepth === 0) break;
        endIdx++;
      }
      
      // Qualify field references in the method body
      const methodBody = qualifiedBody.slice(arrowIdx + 2, endIdx);
      const qualifiedMethodBody = qualifyFieldReferencesInMethod(
        methodBody,
        objectRegion.name,
        fieldNames,
      );
      
      // Reconstruct with qualified method
      qualifiedBody =
        qualifiedBody.slice(0, arrowIdx + 2) +
        qualifiedMethodBody +
        qualifiedBody.slice(endIdx);
      
      searchIdx = arrowIdx + 2 + qualifiedMethodBody.length;
    }
    
    result += `object ${objectRegion.name} { ${qualifiedBody} }`;
    cursor = objectRegion.end;
  }

  return result + source.slice(cursor);
}
