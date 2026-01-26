import {
  matchWord,
  skipBracePair,
  isWhitespace,
  readIdentifier,
} from "./parsing/string-helpers";
import {
  parseLetDeclaration,
  validateVariableUsage,
  parseTypeDeclaration,
  getVariableType,
  isDroppableType,
  clearDroppableTypes,
  clearDropHandlers,
  clearTypeAliases,
  clearVariableTypes,
  clearMovedVariables,
  markMovedVariable,
} from "./parsing/parser-utils";
import { extractParamsWithTypes } from "./parsing/param-helpers";
import {
  clearCompileFunctionDefs,
  setCompileFunctionDef,
} from "./function-defs-storage";
import {
  clearCompileStructDefs,
  setCompileStructDef,
} from "./struct-defs-storage";
import {
  validateParamReferences,
  extractDestructuringFields,
  skipToNextStatement,
  skipWhitespaceOnly,
  findMatchingCloseBrace,
  parseNameAndGenerics,
} from "./parsing/declaration-helpers";
import { parseFieldsDefinition } from "./parsing/field-parsing";
import {
  registerVariable,
  type VariableInfo,
} from "./declaration-parser-helpers";
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
      return skipToNextStatement(source, decl.nextIndex);
    }
  }
  return skipToNextStatement(source, i);
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
    decl.inferredType,
  );

  if (decl.initializerVarName) {
    const sourceType = getVariableType(decl.initializerVarName);
    if (sourceType && isDroppableType(sourceType)) {
      markMovedVariable(decl.initializerVarName);
    }
  }
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
  const parsedName = readIdentifier(source, j);
  const name = parsedName.name;
  j = parsedName.endIdx;
  j = skipWhitespaceOnly(source, j);
  if (j < source.length && source[j] === "{") {
    j = findMatchingCloseBrace(source, j);
  }
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
  const {
    name: fnName,
    endPos: endAfterGenerics,
    generics,
  } = parseNameAndGenerics(source, j);
  j = endAfterGenerics;
  if (fnName && variables.has(fnName)) {
    throw new Error(
      "Function name '" + fnName + "' conflicts with already declared variable",
    );
  }
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
    const paramsStr = source.slice(parenStart + 1, paramEnd).trim();
    if (paramsStr) {
      try {
        const rawParamsStr = source.slice(parenStart, paramEnd + 1);
        const params = extractParamsWithTypes(rawParamsStr);
        if (fnName && params.length > 0) {
          setCompileFunctionDef(fnName, params, generics);
        }
      } catch {
        // Ignore param extraction errors - function will be validated elsewhere
      }
      validateParamReferences(
        paramsStr,
        fnName,
        variables as unknown as Map<string, Record<string, unknown>>,
      );
    }
  }
  return skipToNextStatement(source, j);
}
function handleStructDeclaration(source: string, i: number): number {
  let j = i + 6; // Skip "struct"
  j = skipWhitespaceOnly(source, j);
  const {
    name: structName,
    endPos: endAfterGenerics,
    generics,
  } = parseNameAndGenerics(source, j);
  j = endAfterGenerics;
  while (j < source.length && source[j] !== "{") j++;
  if (j >= source.length) return j;
  const fieldStart = j + 1;
  j = skipBracePair(source, j) - 1;
  const fieldsStr = source.slice(fieldStart, j).trim();
  if (structName && fieldsStr) {
    const fields = parseFieldsDefinition(fieldsStr);
    if (fields.size > 0) {
      setCompileStructDef(structName, fields, generics);
    }
  }
  return j < source.length ? j + 1 : j;
}
function parseDeclarationsImpl(
  source: string,
  variables: Map<string, VariableInfo>,
): void {
  let i = 0;
  while (i < source.length) {
    i = skipWhitespaceOnly(source, i);
    if (i >= source.length) break;
    switch (source[i]) {
      case "{":
      case "}":
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
      i = handleStructDeclaration(source, i);
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
      clearCompileStructDefs();
      clearVariableTypes();
      clearDroppableTypes();
      clearDropHandlers();
      clearTypeAliases();
      clearMovedVariables();
      parseDeclarationsImpl(source, variables);
    },
  };
}
