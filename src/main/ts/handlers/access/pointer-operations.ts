import { isValidIdentifier } from "../../utils/identifier-utils";
import { isIdentifierChar } from "../../utils/helpers/char-utils";
import { extractTypeSize } from "../../type-utils";
import {
  throwCannotCreateMutablePointerToImmutableVariable,
  throwInvalidReferenceTarget,
} from "../../utils/helpers/pointer-errors";

// Global map to store pointer values (which reference variable names)
const pointerMap = new Map<number, string>();
// Track which pointers are mutable
const mutablePointerMap = new Map<number, boolean>();

/**
 * Compute a stable pointer ID based on variable name
 * Uses a simple hash to ensure same variable always gets same ID
 */
function computePointerId(varName: string): number {
  // Use a simple hash based on variable name characters
  // Negative numbers to distinguish from regular values
  let hash = 0;
  for (let i = 0; i < varName.length; i++) {
    hash = (hash << 5) - hash + varName.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  // Return a negative value (pointer addresses are typically negative in some representations)
  // Add a base offset to avoid collisions with other negative values
  return -(Math.abs(hash) + 100000);
}

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
  const pointerValue = computePointerId(varName);
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
  if (!trimmed.startsWith("&")) return undefined;

  let rest = trimmed.slice(1).trim();
  if (rest.startsWith("&")) {
    throw new Error("invalid: cannot take reference of reference");
  }

  let isExplicitlyMutable = false;
  if (rest.startsWith("mut ")) {
    isExplicitlyMutable = true;
    rest = rest.slice(4).trim();
  }

  let i = 0;
  while (i < rest.length && isIdentifierChar(rest[i])) {
    i++;
  }
  if (i === 0) throwInvalidReferenceTarget(rest);

  const varName = rest.slice(0, i);
  const afterVar = rest.slice(i).trim();
  if (afterVar.length > 0 && isBinaryOperator(afterVar)) {
    return undefined;
  }

  // Check if varName is a variable, object, or module
  const isVariable = scope.has(varName);
  const isObject = typeMap?.has("__object__" + varName);
  const isModule = typeMap?.has("__module__" + varName);

  if (!isVariable && !isObject && !isModule) {
    throw new Error(`variable '${varName}' not found in scope`);
  }

  // If the variable contains a pointer, return it directly
  if (isVariable) {
    const varValue = scope.get(varName);
    if (varValue !== undefined && getPointerTarget(varValue) !== undefined) {
      // Variable contains a pointer, return it directly
      return varValue;
    }
  }

  const shouldBeMutable = isExplicitlyMutable || pointerTypeIsMutable;
  validateMutablePointer(shouldBeMutable, varName, mutMap);
  validatePointerType(pointerBaseType, varName, typeMap);

  const pointerValue = computePointerId(varName);
  pointerMap.set(pointerValue, varName);
  mutablePointerMap.set(pointerValue, shouldBeMutable);
  return pointerValue;
}

function validateMutablePointer(
  shouldBeMutable: boolean,
  varName: string,
  mutMap: Map<string, boolean>,
): void {
  if (!shouldBeMutable) return;
  const targetIsMutable = mutMap.get(varName) ?? false;
  if (!targetIsMutable) {
    throwCannotCreateMutablePointerToImmutableVariable(varName);
  }
}

function validatePointerType(
  pointerBaseType: string | undefined,
  varName: string,
  typeMap: Map<string, number> | undefined,
): void {
  if (!pointerBaseType || !typeMap) return;
  const targetType = typeMap.get(varName);
  const expectedType = extractTypeSize(pointerBaseType);
  if (targetType !== undefined && targetType !== expectedType) {
    throw new Error(
      `cannot create pointer to '${varName}': type mismatch (expected ${pointerBaseType}, got variable of type ${targetType})`,
    );
  }
}

function isBinaryOperator(str: string): boolean {
  // Check if the string starts with a binary operator
  const binaryOps = [
    "==",
    "!=",
    "<=",
    ">=",
    "<",
    ">",
    "+",
    "-",
    "*",
    "/",
    "&&",
    "||",
    "is",
    ".",
  ];
  for (const op of binaryOps) {
    if (str.startsWith(op)) return true;
  }
  return false;
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
