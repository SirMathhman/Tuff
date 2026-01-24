import { isValidIdentifier } from "../utils/identifier-utils";

// Global map to store pointer values (which reference variable names)
const pointerMap = new Map<number, string>();
let pointerCounter = 1000; // Pointer values start at 1000 to distinguish from regular values

export function createPointer(varName: string): number {
  const pointerValue = pointerCounter++;
  pointerMap.set(pointerValue, varName);
  return pointerValue;
}

export function getPointerTarget(pointerValue: number): string | undefined {
  return pointerMap.get(pointerValue);
}

export function handleReferenceOperation(
  s: string,
  scope: Map<string, number>,
): number | undefined {
  const trimmed = s.trim();

  // Check if this is a reference operation: &varName
  if (!trimmed.startsWith("&")) return undefined;

  const varName = trimmed.slice(1).trim();

  // Validate that it's a valid identifier
  if (!isValidIdentifier(varName)) return undefined;

  // Check if the variable exists in scope
  if (!scope.has(varName)) return undefined;

  // Create and return a pointer to this variable
  return createPointer(varName);
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
  }

  return undefined;
}
