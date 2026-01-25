import {
  isWhitespace,
  matchWord,
  isIdentifierChar,
  isDigit,
  charAt,
} from "./parsing/string-helpers";
import { skipStructDeclaration } from "./parsing/struct-helpers";
import {
  parseLetDeclaration,
  validateVariableUsage,
  parseTypeDeclaration,
} from "./parsing/parser-utils";

function isIdentifierStartChar(ch: string | undefined): ch is string {
  return ch !== undefined && isIdentifierChar(ch) && !isDigit(ch);
}

/**
 * Extract field names from destructuring pattern like { x, y, z }
 */
function extractDestructuringFields(source: string, start: number): string[] {
  const fields: string[] = [];
  let i = start + 1; // Skip opening {
  while (i < source.length && source[i] !== "}") {
    const ch = charAt(source, i);
    if (isIdentifierStartChar(ch)) {
      const fieldStart = i;
      while (i < source.length && isIdentifierChar(charAt(source, i))) i++;
      fields.push(source.slice(fieldStart, i));
    } else {
      i++;
    }
  }
  return fields;
}

interface VariableInfo {
  type: string | undefined;
  mutable: boolean;
  initialized: boolean;
  isArray?: boolean;
}

function registerVariable(
  varName: string,
  typeAnnotation: string | undefined,
  isMutable: boolean,
  variables: Map<string, VariableInfo>,
  isArray?: boolean,
): void {
  if (variables.has(varName)) {
    throw new Error(`Variable '${varName}' already declared`);
  }
  variables.set(varName, {
    type: typeAnnotation,
    mutable: isMutable,
    initialized: true,
    isArray,
  });
}

function handleForLoop(
  source: string,
  i: number,
  variables: Map<string, VariableInfo>,
): number {
  i += 3;
  while (i < source.length && isWhitespace(source[i])) i++;
  if (i < source.length && source[i] === "(") {
    i++;
    while (i < source.length && isWhitespace(source[i])) i++;
    if (matchWord(source, i, "let")) {
      const decl = parseLetDeclaration(source, i);
      registerVariable(
        decl.varName,
        decl.typeAnnotation,
        decl.isMutable,
        variables,
      );
      i = decl.nextIndex;
      while (i < source.length && source[i] !== ";") {
        i++;
      }
      if (i < source.length) i++;
      return i;
    }
  }
  while (i < source.length && source[i] !== ";") {
    i++;
  }
  if (i < source.length) i++;
  return i;
}

function skipToNextStatement(source: string, i: number): number {
  while (i < source.length && source[i] !== ";") {
    i++;
  }
  if (i < source.length) i++;
  return i;
}

function skipWhitespaceOnly(source: string, i: number): number {
  while (i < source.length && isWhitespace(source[i])) i++;
  return i;
}

function findMatchingCloseBrace(
  source: string,
  openBraceIndex: number,
): number {
  let braceDepth = 1;
  let i = openBraceIndex + 1;
  while (i < source.length && braceDepth > 0) {
    if (source[i] === "{") braceDepth++;
    else if (source[i] === "}") braceDepth--;
    i++;
  }
  return i;
}

function handleLetDeclarationOrDestructuring(
  source: string,
  i: number,
  variables: Map<string, VariableInfo>,
): number {
  let j = i + 3;
  j = skipWhitespaceOnly(source, j);

  if (j < source.length && source[j] === "{") {
    const endBraceIdx = findMatchingCloseBrace(source, j);
    const fields = extractDestructuringFields(source, j);
    for (const field of fields) {
      registerVariable(field, undefined, false, variables, false);
    }
    return skipToNextStatement(source, endBraceIdx);
  }

  const decl = parseLetDeclaration(source, i);
  registerVariable(
    decl.varName,
    decl.typeAnnotation,
    decl.isMutable,
    variables,
    decl.isArray,
  );
  return decl.nextIndex;
}

function parseDeclarationsImpl(
  source: string,
  variables: Map<string, VariableInfo>,
): void {
  let i = 0;

  while (i < source.length) {
    i = skipWhitespaceOnly(source, i);
    if (i >= source.length) break;

    if (source[i] === "{" || source[i] === "}") {
      i++;
      continue;
    }

    if (matchWord(source, i, "for")) {
      i = handleForLoop(source, i, variables);
      continue;
    }

    if (matchWord(source, i, "type")) {
      const decl = parseTypeDeclaration(source, i);
      i = decl.nextIndex;
      continue;
    }

    if (matchWord(source, i, "struct")) {
      i = skipStructDeclaration(source, i);
      continue;
    }

    if (matchWord(source, i, "let")) {
      i = handleLetDeclarationOrDestructuring(source, i, variables);
      continue;
    }

    i = skipToNextStatement(source, i);
  }

  validateVariableUsage(source, variables);
}

/**
 * Factory function to create a declaration parser
 */
export function createDeclarationParser(
  source: string,
  variables: Map<string, VariableInfo>,
) {
  return {
    parseDeclarations() {
      parseDeclarationsImpl(source, variables);
    },
  };
}
