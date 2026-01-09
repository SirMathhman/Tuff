import { Result, Ok, Err } from "./result";

/**
 * Compiles source code.
 * @param source - The source code to compile
 * @returns Result containing compiled code or error message
 */
function compile(source: string): Result<string, string> {
  // Extract type annotations before stripping them
  const typeMatches = source.match(/let\s+(\w+)\s*:\s*(\w+)/g) || [];
  const varTypes = new Map<string, string>();

  for (const match of typeMatches) {
    const [, varName, typeName] = match.match(/let\s+(\w+)\s*:\s*(\w+)/)!;
    varTypes.set(varName, typeName);
  }

  // Strip type annotations (: TypeName)
  const sourceWithoutTypes = source.replace(/:\s*\w+/g, "");

  // Track inferred variable types (for variables without explicit types)
  const inferredTypes = new Map<string, string>();

  // First pass: infer types for all variable declarations
  const allVarMatches = sourceWithoutTypes.match(/let\s+(\w+)\s*=\s*([^;]+)/g) || [];
  for (const varMatch of allVarMatches) {
    const [, varName, value] = varMatch.match(/let\s+(\w+)\s*=\s*([^;]+)/)!;
    const trimmedValue = value.trim();
    if (!varTypes.has(varName)) {
      // Infer type based on value
      if (trimmedValue === "true" || trimmedValue === "false") {
        inferredTypes.set(varName, "Bool");
      } else if (/^\d+$/.test(trimmedValue)) {
        inferredTypes.set(varName, "I32");
      } else if (/^\w+$/.test(trimmedValue)) {
        // It's a variable reference, propagate its type
        if (inferredTypes.has(trimmedValue)) {
          inferredTypes.set(varName, inferredTypes.get(trimmedValue)!);
        } else if (varTypes.has(trimmedValue)) {
          inferredTypes.set(varName, varTypes.get(trimmedValue)!);
        }
      }
    } else {
      // Variable has explicit type, record it
      inferredTypes.set(varName, varTypes.get(varName)!);
    }
  }

  // Check for type mismatches
  for (const [varName, typeName] of varTypes) {
    const regex = new RegExp(`let\\s+${varName}\\s*=\\s*([^;]+)`);
    const match = sourceWithoutTypes.match(regex);
    if (match) {
      const value = match[1].trim();

      // Check if the value is a variable reference
      if (/^\w+$/.test(value) && !(/^\d+$/.test(value)) && value !== "true" && value !== "false") {
        const sourceVarType = inferredTypes.get(value) || varTypes.get(value);
        if (sourceVarType && sourceVarType !== typeName) {
          return new Err(
            `Type Error: Cannot assign variable '${value}' (type ${sourceVarType}) to variable '${varName}' of type '${typeName}'`
          );
        }
      } else if (typeName === "I32") {
        // Simple type checking for I32 (must be numeric, not boolean or string literals)
        if (
          value === "true" ||
          value === "false" ||
          value.includes('"') ||
          value.includes("'")
        ) {
          return new Err(
            `Type Error: Cannot assign '${value}' to variable '${varName}' of type '${typeName}'`
          );
        }
      } else if (typeName === "Bool") {
        // Bool can only be assigned true or false
        if (value !== "true" && value !== "false") {
          return new Err(
            `Type Error: Cannot assign '${value}' to variable '${varName}' of type '${typeName}'`
          );
        }
      }
    }
  }

  // Check for duplicate variable declarations
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

  // Wrap in a function to allow 'let' declarations and return the last expression
  let lastStatement = sourceWithoutTypes.split(";").pop()?.trim() || "";

  // If there's no last statement or it's empty, return 0 as default exit code
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
