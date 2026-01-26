import {
  isWhitespace,
  matchWord,
  isIdentifierChar,
  isDigit,
  charAt,
  readIdentifier,
} from "./parsing/string-helpers";
import { skipStructDeclaration } from "./parsing/struct-helpers";
import {
  parseLetDeclaration,
  validateVariableUsage,
  parseTypeDeclaration,
} from "./parsing/parser-utils";
import { extractParamsWithTypes } from "./parsing/param-helpers";
import { parseBracedBlock } from "./parsing/parse-helpers";
import {
  clearCompileFunctionDefs,
  setCompileFunctionDef,
} from "./function-defs-storage";
import { validateParamReferences } from "./parsing/declaration-helpers";

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
  isUninitialized?: boolean;
}

function registerVariable(
  varName: string,
  typeAnnotation: string | undefined,
  isMutable: boolean,
  variables: Map<string, VariableInfo>,
  isArray?: boolean,
  hasInitializer?: boolean,
): void {
  if (variables.has(varName)) {
    throw new Error(`Variable '${varName}' already declared`);
  }
  const isUninitialized = hasInitializer === false;
  variables.set(varName, {
    type: typeAnnotation,
    mutable: isMutable,
    initialized: !isUninitialized,
    isArray,
    isUninitialized,
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
  return parseBracedBlock(source, openBraceIndex).endIdx;
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
      registerVariable(field, undefined, false, variables, false, true);
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
    decl.hasInitializer,
  );
  return decl.nextIndex;
}

function handleModuleOrObjectDeclaration(
  source: string,
  i: number,
  keyword: string,
  variables: Map<string, VariableInfo>,
): number {
  let j = i + keyword.length;
  j = skipWhitespaceOnly(source, j);

  // Get name
  const parsedName = readIdentifier(source, j);
  const name = parsedName.name;
  j = parsedName.endIdx;
  j = skipWhitespaceOnly(source, j);

  // Skip to end of body
  if (j < source.length && source[j] === "{") {
    j = findMatchingCloseBrace(source, j);
  }

  // Register module/object name as a variable (immutable, initialized)
  if (name && !variables.has(name)) {
    variables.set(name, {
      type: keyword,
      mutable: false,
      initialized: true,
      isArray: false,
    });
  }

  return j;
}

function handleFunctionDeclaration(
  source: string,
  i: number,
  variables: Map<string, VariableInfo>,
): number {
  let j = i + 2; // Skip "fn"
  j = skipWhitespaceOnly(source, j);

  // Get function name
  const nameStart = j;
  while (j < source.length && isIdentifierChar(source[j])) j++;
  const fnName = source.slice(nameStart, j);

  // Check if function name conflicts with a variable
  if (fnName && variables.has(fnName)) {
    throw new Error(
      `Function name '${fnName}' conflicts with already declared variable`,
    );
  }

  // Skip to opening paren
  j = skipWhitespaceOnly(source, j);
  if (j < source.length && source[j] === "(") {
    const parenStart = j;
    j++; // Skip opening paren
    let parenDepth = 1;
    let paramEnd = j;
    while (j < source.length && parenDepth > 0) {
      if (source[j] === "(") parenDepth++;
      else if (source[j] === ")") {
        parenDepth--;
        if (parenDepth === 0) paramEnd = j;
      }
      j++;
    }

    // Extract and validate parameter names
    const paramsStr = source.slice(parenStart + 1, paramEnd).trim();
    if (paramsStr) {
      try {
        // Extract parameter names and types
        const rawParamsStr = source.slice(parenStart, paramEnd + 1);
        const params = extractParamsWithTypes(rawParamsStr);
        if (fnName && params.length > 0) {
          setCompileFunctionDef(fnName, params);
        }
      } catch {
        // Silently continue if params can't be extracted
      }

      // Validate parameter don't shadow existing variables
      validateParamReferences(
        paramsStr,
        fnName,
        variables as unknown as Map<string, Record<string, unknown>>,
      );
    }
  }

  // Skip to next statement
  return skipToNextStatement(source, j);
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

    if (matchWord(source, i, "module")) {
      i = handleModuleOrObjectDeclaration(source, i, "module", variables);
      continue;
    }

    if (matchWord(source, i, "object")) {
      i = handleModuleOrObjectDeclaration(source, i, "object", variables);
      continue;
    }

    if (matchWord(source, i, "let")) {
      i = handleLetDeclarationOrDestructuring(source, i, variables);
      continue;
    }

    if (matchWord(source, i, "fn")) {
      i = handleFunctionDeclaration(source, i, variables);
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
      clearCompileFunctionDefs();
      parseDeclarationsImpl(source, variables);
    },
  };
}
