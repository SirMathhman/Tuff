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

  // Check for type mismatches
  for (const [varName, typeName] of varTypes) {
    const regex = new RegExp(`let\\s+${varName}\\s*=\\s*([^;]+)`);
    const match = sourceWithoutTypes.match(regex);
    if (match) {
      const value = match[1].trim();
      // Simple type checking for I32 (must be numeric, not boolean or string literals)
      if (typeName === "I32") {
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
