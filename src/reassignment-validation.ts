import { type CompileError, isTypeCompatible, isMutablePointerType } from "./types";
import {
  parseLetComponents,
  extractExpressionType,
  type VariableContext,
  parseReassignmentComponents,
  parseDereferenceReassignmentComponents,
} from "./let-binding";

function skipLetBindings(source: string): string {
  let current = source;
  while (current.length > 0) {
    current = current.trim();
    if (!current.startsWith("let")) break;
    const comp = parseLetComponents(current);
    if (!comp) break;
    current = comp.remaining;
  }
  return current;
}

function validateReassignments(
  source: string,
  context: VariableContext,
  validator: (
    varName: string,
    exprPart: string,
    binding: (typeof context)[number] | undefined,
  ) => CompileError | undefined,
): CompileError | undefined {
  let current = skipLetBindings(source);

  while (current.length > 0) {
    current = current.trim();
    const reassignComp = parseReassignmentComponents(current);
    if (!reassignComp) break;

    const binding = context.find((b) => b.name === reassignComp.varName);
    const error = validator(
      reassignComp.varName,
      reassignComp.exprPart,
      binding,
    );
    if (error) return error;

    current = reassignComp.remaining;
  }

  return undefined;
}

export function detectNonMutableReassignment(
  source: string,
  context: VariableContext,
): CompileError | undefined {
  return validateReassignments(
    source,
    context,
    (varName, _exprPart, binding) => {
      if (binding && !binding.mutable) {
        return {
          cause: `Cannot reassign non-mutable variable '${varName}'`,
          reason:
            "Variables must be declared with 'let mut' keyword to allow reassignment",
          fix: `Change 'let ${varName}' to 'let mut ${varName}'`,
          first: { line: 0, column: 0, length: source.length },
        };
      }
      return undefined;
    },
  );
}

export function detectReassignmentTypeChange(
  source: string,
  context: VariableContext,
): CompileError | undefined {
  return validateReassignments(
    source,
    context,
    (varName, exprPart, binding) => {
      if (!binding || !binding.type) {
        return undefined;
      }

      const newExprType = extractExpressionType(exprPart, context);
      if (newExprType && !isTypeCompatible(binding.type, newExprType)) {
        return {
          cause: `Cannot reassign variable '${varName}' with incompatible type: ${newExprType} vs ${binding.type}`,
          reason: "Reassigned value must fit within the variable's type",
          fix: `Ensure the reassigned value has a compatible type (same or narrower)`,
          first: { line: 0, column: 0, length: source.length },
        };
      }
      return undefined;
    },
  );
}

export function detectDereferenceReassignmentOnImmutablePointer(
  source: string,
  context: VariableContext,
): CompileError | undefined {
  let current = skipLetBindings(source);

  while (current.length > 0) {
    current = current.trim();
    const comp = parseDereferenceReassignmentComponents(current);
    if (!comp) break;

    const binding = context.find((b) => b.name === comp.pointerName);
    if (binding && binding.type && !isMutablePointerType(binding.type)) {
      return {
        cause: `Cannot write through immutable pointer '${comp.pointerName}'`,
        reason:
          "Dereference assignment (*ptr = value) requires a mutable pointer (*mut Type), not an immutable pointer (*Type)",
        fix: "Use a mutable pointer type or remove the assignment",
        first: { line: 0, column: 0, length: source.length },
      };
    }

    current = comp.remaining;
  }

  return undefined;
}
