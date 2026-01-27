import { isValidIdentifier } from "../../utils/identifier-utils";
import { extractTypeSize } from "../../type-utils";
import {
  throwCannotCreateMutablePointerToImmutableVariable,
  throwInvalidReferenceTarget,
} from "../../utils/helpers/pointer-errors";

// Global map to store pointer values (which reference variable names)
const pointerMap = new Map<number, string>();
// Track which pointers are mutable
const mutablePointerMap = new Map<number, boolean>();
let pointerCounter = 1000; // Pointer values start at 1000 to distinguish from regular values

/**
 * Check if a pointer type annotation includes the 'mut' keyword
 * Examples: "*mut I32" -> true, "*I32" -> false, "*[I32]" -> false
 */
export function isPointerTypeMutable(typeAnnotation: string): boolean {
  const trimmed = typeAnnotation.trim();
  if (!trimmed.startsWith("*")) return false;
  const afterStar = trimmed.slice(1).trim();
  return afterStar.startsWith("mut ");
}

export function createPointer(
  varName: string,
  isMutable: boolean = false,
): number {
  const pointerValue = pointerCounter++;
  pointerMap.set(pointerValue, varName);
  mutablePointerMap.set(pointerValue, isMutable);
  return pointerValue;
}

export function getPointerTarget(pointerValue: number): string | undefined {
  return pointerMap.get(pointerValue);
}

export function isPointerMutable(pointerValue: number): boolean {
  return mutablePointerMap.get(pointerValue) ?? false;
}

export function handleReferenceOperation(
  s: string,
  scope: Map<string, number>,
  mutMap: Map<string, boolean> = new Map(),
  pointerTypeIsMutable: boolean = false,
  typeMap?: Map<string, number>,
  pointerBaseType?: string,
): number | undefined {
  const trimmed = s.trim();

  // Check if this is a reference operation: &varName or &mut varName
  if (!trimmed.startsWith("&")) return undefined;

  let rest = trimmed.slice(1).trim();

  // Reject double references: &&x
  if (rest.startsWith("&")) {
    throw new Error("invalid: cannot take reference of reference");
  }

  // Check if this is a mutable reference (&mut varName)
  let isExplicitlyMutable = false;
  if (rest.startsWith("mut ")) {
    isExplicitlyMutable = true;
    rest = rest.slice(4).trim();
  }

  // Validate that it's a valid identifier (no expressions like &(100) or &(x+y))
  if (!isValidIdentifier(rest)) {
    throwInvalidReferenceTarget(rest);
  }

  const varName = rest;

  // Check if the variable exists in scope
  if (!scope.has(varName)) {
    throw new Error(`variable '${varName}' not found in scope`);
  }

  // Determine if the pointer should be mutable:
  // 1. If &mut syntax is used explicitly, it's mutable
  // 2. Otherwise, use the type annotation parameter
  const shouldBeMutable = isExplicitlyMutable || pointerTypeIsMutable;

  // For *mut pointers, target variable must be mutable
  if (shouldBeMutable) {
    const targetIsMutable = mutMap.get(varName) ?? false;
    if (!targetIsMutable) {
      throwCannotCreateMutablePointerToImmutableVariable(varName);
    }
  }

  // Validate type compatibility if pointer base type is specified
  if (pointerBaseType && typeMap) {
    const targetType = typeMap.get(varName);
    const expectedType = extractTypeSize(pointerBaseType);
    if (targetType !== undefined && targetType !== expectedType) {
      throw new Error(
        `cannot create pointer to '${varName}': type mismatch (expected ${pointerBaseType}, got variable of type ${targetType})`,
      );
    }
  }

  // Inline createPointer and return a pointer to this variable
  // Pointer mutability is determined by either the &mut syntax or the type annotation
  const pointerValue = pointerCounter++;
  pointerMap.set(pointerValue, varName);
  mutablePointerMap.set(pointerValue, shouldBeMutable);
  return pointerValue;
}

export function handleDereferenceOperation(
  s: string,
  scope: Map<string, number>,
): number | undefined {
  const trimmed = s.trim();

  // Check if this is a dereference operation: *pointerValue
  if (!trimmed.startsWith("*")) return undefined;

  const operandStr = trimmed.slice(1).trim();

  // The operand could be a variable name or an expression
  // For now, handle simple variable names
  if (isValidIdentifier(operandStr) && scope.has(operandStr)) {
    const pointerValue = scope.get(operandStr)!;
    const targetVarName = getPointerTarget(pointerValue);
    if (targetVarName && scope.has(targetVarName)) {
      return scope.get(targetVarName)!;
    }
    // If the value isn't a pointer, error
    throw new Error(`cannot dereference non-pointer value '${operandStr}'`);
  }

  return undefined;
}
