import { Result, Ok, Err } from "./result";

/**
 * Extracts and records variable type annotations
 */
function extractVarTypes(source: string): Map<string, string> {
  const typeMatches = source.match(/let\s+(\w+)\s*:\s*(\w+)/g) || [];
  const varTypes = new Map<string, string>();

  for (const match of typeMatches) {
    const [, varName, typeName] = match.match(/let\s+(\w+)\s*:\s*(\w+)/)!;
    varTypes.set(varName, typeName);
  }

  return varTypes;
}

/**
 * Infers types for variables based on their values
 */
function inferVarTypes(
  sourceWithoutTypes: string,
  varTypes: Map<string, string>
): Map<string, string> {
  const inferredTypes = new Map<string, string>();
  const allVarMatches =
    sourceWithoutTypes.match(/let\s+(\w+)\s*=\s*([^;]+)/g) || [];

  for (const varMatch of allVarMatches) {
    const [, varName, value] = varMatch.match(/let\s+(\w+)\s*=\s*([^;]+)/)!;
    const trimmedValue = value.trim();

    if (!varTypes.has(varName)) {
      if (trimmedValue === "true" || trimmedValue === "false") {
        inferredTypes.set(varName, "Bool");
      } else if (/^\d+$/.test(trimmedValue)) {
        inferredTypes.set(varName, "I32");
      } else if (/^\w+$/.test(trimmedValue)) {
        // Propagate type from referenced variable
        if (inferredTypes.has(trimmedValue)) {
          inferredTypes.set(varName, inferredTypes.get(trimmedValue)!);
        } else if (varTypes.has(trimmedValue)) {
          inferredTypes.set(varName, varTypes.get(trimmedValue)!);
        }
      }
    } else {
      inferredTypes.set(varName, varTypes.get(varName)!);
    }
  }

  return inferredTypes;
}

/**
 * Validates type assignments
 */
function validateTypes(
  sourceWithoutTypes: string,
  varTypes: Map<string, string>,
  inferredTypes: Map<string, string>
): Result<void, string> {
  for (const [varName, typeName] of varTypes) {
    const regex = new RegExp(`let\\s+${varName}\\s*=\\s*([^;]+)`);
    const match = sourceWithoutTypes.match(regex);
    if (!match) continue;

    const value = match[1].trim();
    const isVarRef =
      /^\w+$/.test(value) &&
      !/^\d+$/.test(value) &&
      value !== "true" &&
      value !== "false";

    if (isVarRef) {
      const sourceVarType = inferredTypes.get(value) || varTypes.get(value);
      if (sourceVarType && sourceVarType !== typeName) {
        return new Err(
          `Type Error: Cannot assign variable '${value}' (type ${sourceVarType}) to variable '${varName}' of type '${typeName}'`
        );
      }
    } else if (typeName === "I32" && isInvalidI32Value(value)) {
      return new Err(
        `Type Error: Cannot assign '${value}' to variable '${varName}' of type '${typeName}'`
      );
    } else if (typeName === "Bool" && !isBoolValue(value)) {
      return new Err(
        `Type Error: Cannot assign '${value}' to variable '${varName}' of type '${typeName}'`
      );
    }
  }

  return new Ok(undefined);
}

/**
 * Checks if a value is invalid for I32
 */
function isInvalidI32Value(value: string): boolean {
  return (
    value === "true" ||
    value === "false" ||
    value.includes('"') ||
    value.includes("'")
  );
}

/**
 * Checks if a value is a valid Bool
 */
function isBoolValue(value: string): boolean {
  return value === "true" || value === "false";
}

/**
 * Checks for duplicate variable declarations
 */
function checkDuplicates(sourceWithoutTypes: string): Result<void, string> {
  const varMatches = sourceWithoutTypes.match(/let\s+(\w+)\s*=/g) || [];
  const declaredVars = new Set<string>();

  for (const match of varMatches) {
    const varName = match.match(/let\s+(\w+)/)![1];
    if (declaredVars.has(varName)) {
      return new Err(
        `Compile Error: Identifier '${varName}' has already been declared`
      );
    }
    declaredVars.add(varName);
  }

  return new Ok(undefined);
}

/**
 * Compiles source code.
 * @param source - The source code to compile
 * @returns Result containing compiled code or error message
 */
function compile(source: string): Result<string, string> {
  const varTypes = extractVarTypes(source);
  const sourceWithoutTypes = source.replace(/:\s*\w+/g, "");
  const inferredTypes = inferVarTypes(sourceWithoutTypes, varTypes);

  const typeCheckResult = validateTypes(
    sourceWithoutTypes,
    varTypes,
    inferredTypes
  );
  if (typeCheckResult.isErr()) {
    return typeCheckResult as Result<string, string>;
  }

  const duplicateCheckResult = checkDuplicates(sourceWithoutTypes);
  if (duplicateCheckResult.isErr()) {
    return duplicateCheckResult as Result<string, string>;
  }

  let lastStatement = sourceWithoutTypes.split(";").pop()?.trim() || "";

  if (!lastStatement) {
    lastStatement = "0";
  }

  return new Ok(
    `(function() { ${sourceWithoutTypes}; return ${lastStatement}; })()`
  );
}

/**
 * Interprets source code by compiling and evaluating it.
 * @param source - The source code to interpret
 * @returns The exit code (number result of the compiled code)
 */
function interpret(source: string): number {
  const compiled = compile(source);
  if (compiled.isErr()) {
    compiled.getOrThrow();
  }
  return eval(compiled.getOrThrow()) as number;
}

export { interpret, compile };
