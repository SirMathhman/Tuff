import { getPointerTarget, isPointerMutable } from "../access/pointer-operations";
import type { Interpreter } from "../../expressions/handlers";

export function handleDereferenceAssignment(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpretWithScope: Interpreter,
): number | undefined {
  // Check if this is a dereference assignment: *varName = value;
  const trimmed = s.trim();
  if (!trimmed.startsWith("*")) return undefined;

  // Find the equals sign, being careful about operators like ==
  let eqIdx = -1;
  for (let i = 1; i < trimmed.length; i++) {
    if (trimmed[i] === "=") {
      // Make sure it's not ==, !=, <=, >=, =>
      if (
        (i + 1 >= trimmed.length || trimmed[i + 1] !== "=") &&
        (i === 0 ||
          (trimmed[i - 1] !== "!" &&
            trimmed[i - 1] !== "<" &&
            trimmed[i - 1] !== ">" &&
            trimmed[i - 1] !== "="))
      ) {
        eqIdx = i;
        break;
      }
    }
  }

  if (eqIdx === -1) return undefined;

  const lhs = trimmed.slice(0, eqIdx).trim();

  // Verify it's a dereference: *varName
  if (!lhs.startsWith("*")) return undefined;

  const pointerVarName = lhs.slice(1).trim();

  // Check that the pointer variable exists in scope
  if (!scope.has(pointerVarName)) return undefined;

  // Get the pointer value
  const pointerValue = scope.get(pointerVarName)!;
  const targetVarName = getPointerTarget(pointerValue);

  if (!targetVarName || !scope.has(targetVarName)) return undefined;

  // Check if the pointer is mutable
  if (!isPointerMutable(pointerValue)) {
    throw new Error(`cannot assign to immutable pointer`);
  }

  const semiIdx = trimmed.indexOf(";", eqIdx);
  if (semiIdx === -1) return undefined;

  const newValue = interpretWithScope(
    trimmed.slice(eqIdx + 1, semiIdx).trim(),
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );

  // Update the target variable
  scope.set(targetVarName, newValue);

  const rest = trimmed.slice(semiIdx + 1).trim();
  if (rest === "") {
    return newValue;
  }

  return interpretWithScope(
    rest,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
}
