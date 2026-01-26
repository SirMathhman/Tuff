import { extractTypeSize } from "../../../type-utils";
import {
  isIdentifierChar,
  isIdentifierStartChar,
  isWhitespace,
} from "../../parsing/string-helpers";

export interface VariableInfo {
  type: string | undefined;
  mutable: boolean;
  initialized: boolean;
  isArray?: boolean;
}

/**
 * Validate pointer operations at compile time
 * - Ensure pointer type assignments match variable types
 * - Ensure *mut pointers are only created from mutable variables
 * - Ensure pointer assignments use references (&x), not direct values
 * - Ensure pointer assignments only reference addressable sources (variables)
 * - Validate dereferenced assignments (*p = value) for mutability
 */
export function validatePointerOperations(
  source: string,
  variables: Map<string, VariableInfo>,
): void {
  let i = 0;
  while (i < source.length) {
    if (source[i] === "l" && source.slice(i, i + 4) === "let ") {
      validateLetDeclaration(source, i, variables);
      const semiIdx = source.indexOf(";", i);
      i = semiIdx !== -1 ? semiIdx + 1 : source.length;
    } else if (source[i] === "*" && i + 1 < source.length) {
      validateDereferencedAssignment(source, i, variables);
      i++;
    } else {
      i++;
    }
  }
}

function validateLetDeclaration(
  source: string,
  startIdx: number,
  variables: Map<string, VariableInfo>,
): void {
  const semiIdx = source.indexOf(";", startIdx);
  const stmtEnd = semiIdx !== -1 ? semiIdx : source.length;
  const stmt = source.slice(startIdx, stmtEnd);

  const colonIdx = stmt.indexOf(":");
  const eqIdx = stmt.indexOf("=");
  const realColonIdx = colonIdx !== -1 ? startIdx + colonIdx : -1;
  const realEqIdx = eqIdx !== -1 ? startIdx + eqIdx : -1;

  if (
    realColonIdx !== -1 &&
    realColonIdx < (realEqIdx !== -1 ? realEqIdx : stmtEnd)
  ) {
    const typeStart = realColonIdx + 1;
    const typeEnd = realEqIdx !== -1 ? realEqIdx : stmtEnd;
    const typeStr = source.slice(typeStart, typeEnd).trim();

    if (typeStr.startsWith("*") && realEqIdx !== -1) {
      validatePointerAssignment(source, typeStr, realEqIdx, stmtEnd, variables);
    }
  }
}

function validatePointerAssignment(
  source: string,
  typeStr: string,
  eqIdx: number,
  stmtEnd: number,
  variables: Map<string, VariableInfo>,
): void {
  const exprStart = eqIdx + 1;
  const exprStr = source.slice(exprStart, stmtEnd).trim();

  if (exprStr.startsWith("&")) {
    const refTarget = tryExtractVarFromReference(exprStr);
    if (refTarget) {
      validateReferenceTarget(typeStr, refTarget, variables);
    } else {
      throw new Error(`invalid: can only take reference of variable names`);
    }
  } else if (exprStr.startsWith('"') || exprStr.startsWith("'")) {
    // String literal - allowed for *Str pointers
  } else if (isIdentifierLike(exprStr)) {
    validateIdentifierAssignment(typeStr, exprStr, variables);
  }
}

function validateReferenceTarget(
  typeStr: string,
  refTarget: string,
  variables: Map<string, VariableInfo>,
): void {
  const baseType = typeStr.startsWith("*mut ")
    ? typeStr.slice(5).trim()
    : typeStr.slice(1).trim();

  const varInfo = variables.get(refTarget);
  if (!varInfo) {
    return;
  }

  const expectedTypeSize = extractTypeSize(baseType);
  const actualTypeSize = varInfo.type ? extractTypeSize(varInfo.type) : 0;
  if (
    expectedTypeSize !== 0 &&
    actualTypeSize !== 0 &&
    expectedTypeSize !== actualTypeSize
  ) {
    throw new Error(
      `type mismatch: cannot create pointer to '${refTarget}' of type ${varInfo.type}, expected ${baseType}`,
    );
  }

  if (typeStr.startsWith("*mut ") && !varInfo.mutable) {
    throw new Error(
      `cannot create mutable pointer to immutable variable '${refTarget}'`,
    );
  }
}

function validateIdentifierAssignment(
  typeStr: string,
  varName: string,
  variables: Map<string, VariableInfo>,
): void {
  const sourceVar = variables.get(varName);
  if (!sourceVar) {
    return;
  }

  if (sourceVar.type) {
    if (sourceVar.type === "*") {
      // Pointer type marker - allow
    } else if (!sourceVar.type.startsWith("*")) {
      throw new Error(
        `cannot assign non-pointer value to pointer type ${typeStr}`,
      );
    }
  } else {
    throw new Error(
      `cannot assign non-pointer value to pointer type ${typeStr}`,
    );
  }
}

function validateDereferencedAssignment(
  source: string,
  starIdx: number,
  variables: Map<string, VariableInfo>,
): void {
  const afterStar = starIdx + 1;
  let varNameEnd = afterStar;

  while (varNameEnd < source.length && isIdentifierChar(source[varNameEnd])) {
    varNameEnd++;
  }

  if (varNameEnd <= afterStar) {
    return;
  }

  const ptrVarName = source.slice(afterStar, varNameEnd).trim();
  let eqIdx = varNameEnd;

  while (eqIdx < source.length && isWhitespace(source[eqIdx]!)) {
    eqIdx++;
  }

  if (eqIdx >= source.length || source[eqIdx] !== "=") {
    return;
  }

  const ptrVar = variables.get(ptrVarName);
  if (ptrVar && ptrVar.type && !ptrVar.type.startsWith("*mut ")) {
    if (ptrVar.type.startsWith("*")) {
      throw new Error(`cannot assign to immutable pointer '${ptrVarName}'`);
    }
  }
}

function isIdentifierLike(str: string): boolean {
  if (str.length === 0) return false;
  if (!isIdentifierStartChar(str[0])) return false;
  for (let i = 1; i < str.length; i++) {
    if (!isIdentifierChar(str[i])) return false;
  }
  return true;
}

function tryExtractVarFromReference(exprStr: string): string | undefined {
  if (!exprStr.startsWith("&")) return undefined;
  const afterAnd = exprStr.slice(1).trim();

  let i = 0;
  while (i < afterAnd.length && isIdentifierChar(afterAnd[i])) {
    i++;
  }

  if (i > 0) {
    return afterAnd.slice(0, i);
  }
  return undefined;
}
