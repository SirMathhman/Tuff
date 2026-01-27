import { matchWord, skipBracePair } from "./parsing/string-helpers";
import {
  parseLetDeclaration,
  getVariableType,
  isDroppableType,
  markMovedVariable,
  addDeclaredType,
  parseTypeDeclaration,
} from "./parsing/parser-utils";
import { extractParamsWithTypes } from "./parsing/param-helpers";
import { setCompileFunctionDef } from "./storage/function-defs-storage";
import { setCompileStructDef } from "./storage/struct-defs-storage";
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

export function handleLetDeclarationOrDestructuring(
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

export function handleModuleOrObjectDeclaration(
  source: string,
  i: number,
  keyword: string,
  variables: Map<string, VariableInfo>,
): number {
  let j = i + keyword.length;
  j = skipWhitespaceOnly(source, j);
  const { name, endPos: endAfterGenerics } = parseNameAndGenerics(source, j);
  j = endAfterGenerics;
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
    addDeclaredType(name);
  }
  return j;
}

export function handleFunctionDeclaration(
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
      processFnParams(
        source,
        parenStart,
        paramEnd,
        fnName,
        generics,
        paramsStr,
        variables,
      );
    }
  }
  return skipToNextStatement(source, j);
}

function processFnParams(
  source: string,
  parenStart: number,
  paramEnd: number,
  fnName: string,
  generics: string[] | undefined,
  paramsStr: string,
  variables: Map<string, VariableInfo>,
) {
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

export function handleStructDeclaration(source: string, i: number): number {
  let j = i + 6; // Skip "struct"
  j = skipWhitespaceOnly(source, j);
  const {
    name: structName,
    endPos: endAfterGenerics,
    generics,
  } = parseNameAndGenerics(source, j);
  j = handleDeclarationBody(
    source,
    endAfterGenerics,
    structName,
    generics,
    true,
  );
  return j < source.length ? j + 1 : j;
}

export function handleContractDeclaration(source: string, i: number): number {
  let j = i + 8; // Skip "contract"
  j = skipWhitespaceOnly(source, j);
  const { name: contractName, endPos: endAfterGenerics } = parseNameAndGenerics(
    source,
    j,
  );
  j = handleDeclarationBody(
    source,
    endAfterGenerics,
    contractName,
    undefined,
    false,
  );
  return j;
}

function handleDeclarationBody(
  source: string,
  startPos: number,
  name: string,
  generics: string[] | undefined,
  isStruct: boolean,
): number {
  let j = startPos;
  while (j < source.length && source[j] !== "{") j++;
  if (j >= source.length) return j;
  const fieldStart = j + 1;
  j = skipBracePair(source, j) - (isStruct ? 1 : -1);
  if (isStruct) {
    const fieldsStr = source.slice(fieldStart, j).trim();
    if (name && fieldsStr) {
      const fields = parseFieldsDefinition(fieldsStr);
      if (fields.size > 0) {
        setCompileStructDef(name, fields, generics);
        addDeclaredType(name);
      }
    }
  } else {
    if (name) {
      addDeclaredType(name);
    }
    j = skipBracePair(source, startPos);
  }
  return j;
}

export function processDeclarationKeyword(
  source: string,
  i: number,
  variables: Map<string, VariableInfo>,
): number {
  if (matchWord(source, i, "for")) return skipToNextStatement(source, i + 3); // Handled by caller if needed
  if (matchWord(source, i, "type"))
    return parseTypeDeclaration(source, i).nextIndex;
  if (matchWord(source, i, "struct")) return handleStructDeclaration(source, i);
  if (matchWord(source, i, "contract"))
    return handleContractDeclaration(source, i);
  if (matchWord(source, i, "module"))
    return handleModuleOrObjectDeclaration(source, i, "module", variables);
  if (matchWord(source, i, "object"))
    return handleModuleOrObjectDeclaration(source, i, "object", variables);
  if (matchWord(source, i, "let"))
    return handleLetDeclarationOrDestructuring(source, i, variables);
  if (matchWord(source, i, "fn"))
    return handleFunctionDeclaration(source, i, variables);
  return -1;
}
