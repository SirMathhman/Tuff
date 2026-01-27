import { extractTypeSize } from "../../../type-utils";
import { isValidIdentifier } from "../../../utils/identifier-utils";
import {
  isIdentifierChar,
  isIdentifierStartChar,
  isWhitespace,
} from "../../parsing/string-helpers";
import { forEachLetStatement } from "../helpers/let-statement";
import {
  collectArrayInfo,
  validateArrayIndexAccess,
  type ArrayBoundsInfo,
} from "./array-bounds-validation";
import {
  throwCannotAssignNonPointerToPointerType,
  throwCannotAssignToImmutablePointer,
  throwCannotCreateMutablePointerToImmutableVariable,
  throwInvalidReferenceTarget,
  throwPointerTypeMismatch,
} from "../../../utils/helpers/pointer-errors";

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
 * - Validate array index bounds for constant indices
 */
export function validatePointerOperations(
  source: string,
  variables: Map<string, VariableInfo>,
): void {
  const boundsInfo: ArrayBoundsInfo = {
    arrayLengths: new Map(),
    pointerTargets: new Map(),
  };

  // First pass: collect array lengths and pointer targets
  collectArrayInfo(source, boundsInfo);

  // Second pass: validate pointer operations
  forEachLetStatement(source, (startIdx) => {
    validateLetDeclaration(source, startIdx, variables, boundsInfo);
  });

  // Validate dereferenced assignments (*p = value)
  let i = 0;
  while (i < source.length) {
    if (source[i] === "*" && i + 1 < source.length) {
      validateDereferencedAssignment(source, i, variables);
    }
    i++;
  }

  // Third pass: validate array index access
  validateArrayIndexAccess(source, boundsInfo);
}

function validateLetDeclaration(
  source: string,
  startIdx: number,
  variables: Map<string, VariableInfo>,
  _boundsInfo: ArrayBoundsInfo,
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
      throwInvalidReferenceTarget(exprStr.slice(1).trim());
    }
  } else if (exprStr.startsWith('"') || exprStr.startsWith("'")) {
    // String literal - allowed for *Str pointers
  } else if (isValidIdentifier(exprStr)) {
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

  // Bool requires exact type match - cannot create *Bool from untyped or numeric variable
  if (baseType === "Bool") {
    if (varInfo.type !== "Bool") {
      throwPointerTypeMismatch(refTarget, varInfo.type, "Bool");
    }
  }

  const expectedTypeSize = extractTypeSize(baseType);
  const actualTypeSize = varInfo.type ? extractTypeSize(varInfo.type) : 0;
  if (
    expectedTypeSize !== 0 &&
    actualTypeSize !== 0 &&
    expectedTypeSize !== actualTypeSize
  ) {
    throwPointerTypeMismatch(refTarget, varInfo.type, baseType);
  }

  if (typeStr.startsWith("*mut ") && !varInfo.mutable) {
    throwCannotCreateMutablePointerToImmutableVariable(refTarget);
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

  const sourceType = sourceVar.type;
  const isMutableTarget = typeStr.startsWith("*mut ");

  // Check if source has a pointer type
  if (!sourceType || (!sourceType.startsWith("*") && sourceType !== "*")) {
    throwCannotAssignNonPointerToPointerType(typeStr);
  }

  // Check mutability compatibility: cannot assign immutable pointer to mutable pointer type
  const sourceIsMutable =
    sourceType === "*" ? false : sourceType.startsWith("*mut ");
  if (isMutableTarget && !sourceIsMutable) {
    throw new Error(
      `cannot assign immutable pointer '${varName}' to mutable pointer type ${typeStr}`,
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
      throwCannotAssignToImmutablePointer(ptrVarName);
    }
  }
}

function tryExtractVarFromReference(exprStr: string): string | undefined {
  if (!exprStr.startsWith("&")) return undefined;
  let afterAnd = exprStr.slice(1).trim();

  // Strip 'mut' keyword if present (&mut varName)
  if (afterAnd.startsWith("mut ")) {
    afterAnd = afterAnd.slice(4).trim();
  }

  // Must start with valid identifier start char (not a digit)
  if (afterAnd.length === 0 || !isIdentifierStartChar(afterAnd[0])) {
    return undefined;
  }

  let i = 1;
  while (i < afterAnd.length && isIdentifierChar(afterAnd[i])) {
    i++;
  }

  return afterAnd.slice(0, i);
}
