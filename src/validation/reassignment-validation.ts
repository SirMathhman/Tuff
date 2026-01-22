import {
  type CompileError,
  isTypeCompatible,
  isMutablePointerType,
} from "../types/types";
import { type VariableContext, type VariableBinding } from "../types/variable-types";
import { parseLetComponents, extractExpressionType } from "../support/let-binding";
import {
  parseReassignmentComponents,
  parseDereferenceReassignmentComponents,
  parseArrayIndexReassignmentComponents,
} from "../parsing/reassignment-parsing";

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

function handleRegularReassignment(
  reassignComp: ReturnType<typeof parseReassignmentComponents>,
  varName: string,
): number {
  if (reassignComp && reassignComp.varName === varName) {
    return 1;
  }
  return 0;
}

function handleArrayReassignment(
  arrayIndexComp: ReturnType<typeof parseArrayIndexReassignmentComponents>,
  varName: string,
): number {
  if (arrayIndexComp && arrayIndexComp.arrayName === varName) {
    return 1;
  }
  return 0;
}

function countReassignments(source: string, varName: string): number {
  let count = 0;
  let current = skipLetBindings(source);

  while (current.length > 0) {
    current = current.trim();

    // Check for regular reassignments
    const reassignComp = parseReassignmentComponents(current);
    if (reassignComp) {
      count += handleRegularReassignment(reassignComp, varName);
      current = reassignComp.remaining;
      continue;
    }

    // Check for array index reassignments
    const arrayIndexComp = parseArrayIndexReassignmentComponents(current);
    if (arrayIndexComp) {
      count += handleArrayReassignment(arrayIndexComp, varName);
      current = arrayIndexComp.remaining;
      continue;
    }

    break;
  }

  return count;
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
        // Declaration-only variables can be assigned once without needing 'mut'
        if (binding.declarationOnly) {
          // Allow first assignment, but not subsequent ones (handled by detectMultipleReassignmentsToDeclarationOnly)
          return undefined;
        }
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

type ArrayIndexProcessor = (
  comp: ReturnType<typeof parseArrayIndexReassignmentComponents>,
  binding: VariableBinding | undefined,
  source: string,
) => CompileError | undefined;

function processArrayIndexReassignments(
  source: string,
  context: VariableContext,
  processor: ArrayIndexProcessor,
): CompileError | undefined {
  let current = skipLetBindings(source);

  while (current.length > 0) {
    current = current.trim();
    const comp = parseArrayIndexReassignmentComponents(current);
    if (!comp) break;

    const binding = context.find((b) => b.name === comp.arrayName);
    const error = processor(comp, binding, source);
    if (error) return error;

    current = comp.remaining;
  }

  return undefined;
}

export function detectArrayIndexReassignmentOnImmutableArray(
  source: string,
  context: VariableContext,
): CompileError | undefined {
  return processArrayIndexReassignments(source, context, (comp, binding) => {
    if (binding && !binding.mutable) {
      return {
        cause: `Cannot assign to index of non-mutable array '${comp.arrayName}'`,
        reason:
          "Array element assignment requires the array to be declared with 'let mut'",
        fix: `Change 'let ${comp.arrayName}' to 'let mut ${comp.arrayName}'`,
        first: { line: 0, column: 0, length: source.length },
      };
    }
    return undefined;
  });
}

export function detectOutOfOrderArrayAssignment(
  source: string,
  context: VariableContext,
): CompileError | undefined {
  const arrayAssignments: Map<string, number> = new Map();

  return processArrayIndexReassignments(
    source,
    context,
    (comp, binding, srcArg) => {
      if (!binding || !binding.type || !binding.type.startsWith("[")) {
        return undefined;
      }

      const indexNum = parseInt(comp.indexExpr, 10);
      if (isNaN(indexNum)) {
        return undefined;
      }

      const lastAssignedIndex = arrayAssignments.get(comp.arrayName) ?? -1;

      if (indexNum !== lastAssignedIndex + 1) {
        return {
          cause: `Array elements must be initialized in order for declaration-only arrays`,
          reason: `Array '${comp.arrayName}' has ${lastAssignedIndex + 1} initialized element(s), but trying to assign to index ${indexNum}. Must assign to index ${lastAssignedIndex + 1} next.`,
          fix: `Assign array elements sequentially starting from index 0`,
          first: { line: 0, column: 0, length: srcArg.length },
        };
      }

      arrayAssignments.set(comp.arrayName, indexNum);
      return undefined;
    },
  );
}

function checkDeclarationOnlyRestrictions(
  binding: VariableBinding,
  source: string,
): CompileError | undefined {
  if (!binding.declarationOnly || binding.mutable) {
    return undefined;
  }

  const reassignCount = countReassignments(source, binding.name);
  if (reassignCount <= 1) {
    return undefined;
  }

  return {
    cause: `Cannot reassign declaration-only variable '${binding.name}' more than once`,
    reason:
      "Variables declared without initialization (let x: Type;) can only be assigned once to initialize them. Use 'let mut x: Type;' for multiple reassignments.",
    fix: `Change declaration to 'let mut ${binding.name} : ${binding.type};'`,
    first: { line: 0, column: 0, length: source.length },
  };
}

export function detectMultipleReassignmentsToDeclarationOnly(
  source: string,
  context: VariableContext,
): CompileError | undefined {
  for (const binding of context) {
    const error = checkDeclarationOnlyRestrictions(binding, source);
    if (error) {
      return error;
    }
  }

  return undefined;
}

function findVariableUsage(source: string, varName: string): number {
  let current = skipLetBindings(source);

  // Check remaining code for any reference to the variable
  while (current.length > 0) {
    current = current.trim();

    // Skip regular reassignments
    const reassignComp = parseReassignmentComponents(current);
    if (reassignComp) {
      current = reassignComp.remaining;
      continue;
    }

    // Skip array index reassignments
    const arrayIndexComp = parseArrayIndexReassignmentComponents(current);
    if (arrayIndexComp) {
      current = arrayIndexComp.remaining;
      continue;
    }

    // Check if the remaining code is just the variable name or contains it
    if (current === varName || current.startsWith(varName)) {
      return 1; // Found a usage
    }

    break;
  }

  return 0;
}

function buildUninitializedVarError(
  varName: string,
  source: string,
  fixSuffix?: string,
): CompileError {
  return {
    cause: `Uninitialized declaration-only variable '${varName}' used without assignment`,
    reason:
      "Declaration-only variables (let x: Type;) must be assigned before use",
    fix:
      fixSuffix ||
      `Assign a value to '${varName}' before using it in expressions`,
    first: { line: 0, column: 0, length: source.length },
  };
}

function checkBindingUsesUninitializedVar(
  comp: ReturnType<typeof parseLetComponents>,
  binding: VariableBinding,
  source: string,
): CompileError | undefined {
  const isUsed =
    comp &&
    comp.exprPart.includes(binding.name) &&
    !comp.varName.includes(binding.name);

  if (!isUsed) {
    return undefined;
  }

  return buildUninitializedVarError(binding.name, source);
}

function processBindingForUninitializedVars(
  comp: ReturnType<typeof parseLetComponents>,
  context: VariableContext,
  assignedVars: Set<string>,
  source: string,
): CompileError | undefined {
  for (const binding of context) {
    if (!binding.declarationOnly || assignedVars.has(binding.name)) {
      continue;
    }

    const error = checkBindingUsesUninitializedVar(comp, binding, source);
    if (error) {
      return error;
    }
  }

  return undefined;
}

function checkDeclarationOnlyUsageInBindings(
  source: string,
  context: VariableContext,
): CompileError | undefined {
  let remaining = source;
  const assignedVars = new Set<string>();

  while (remaining.length > 0) {
    remaining = remaining.trim();
    if (!remaining.startsWith("let")) break;

    const comp = parseLetComponents(remaining);
    if (!comp) break;

    const error = processBindingForUninitializedVars(
      comp,
      context,
      assignedVars,
      source,
    );
    if (error) {
      return error;
    }

    // Mark this variable as assigned if it has an expression
    if (comp.exprPart !== "") {
      assignedVars.add(comp.varName);
    }

    remaining = comp.remaining;
  }

  return undefined;
}

export function detectUninitializedDeclarationOnly(
  source: string,
  context: VariableContext,
): CompileError | undefined {
  // First check for usage in let binding expressions
  const bindingError = checkDeclarationOnlyUsageInBindings(source, context);
  if (bindingError) return bindingError;

  // Then check for usage in remaining code after let bindings
  for (const binding of context) {
    if (!binding.declarationOnly) {
      continue;
    }

    // Check if this declaration-only variable was assigned
    const reassignCount = countReassignments(source, binding.name);
    if (reassignCount > 0) {
      continue; // Variable was assigned, it's fine
    }

    // Check if the variable is used anywhere after declaration
    const usageCount = findVariableUsage(source, binding.name);
    if (usageCount > 0) {
      return buildUninitializedVarError(
        binding.name,
        source,
        `Assign a value before using the variable, e.g., 'let ${binding.name} : ${binding.type}; ${binding.name} = value;'`,
      );
    }
  }

  return undefined;
}
