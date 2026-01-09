/**
 * Compiles source code.
 * @param source - The source code to compile
 * @returns The compiled code
 * @throws Error if duplicate variable declarations are found
 */
function compile(source: string): string {
  // Strip type annotations (: TypeName)
  const sourceWithoutTypes = source.replace(/:\s*\w+/g, "");

  // Check for duplicate variable declarations
  const varMatches = sourceWithoutTypes.match(/let\s+(\w+)\s*=/g) || [];
  const declaredVars = new Set<string>();

  for (const match of varMatches) {
    const varName = match.match(/let\s+(\w+)/)![1];
    if (declaredVars.has(varName)) {
      throw new Error(
        `Compile Error: Identifier '${varName}' has already been declared`
      );
    }
    declaredVars.add(varName);
  }

  // Wrap in a function to allow 'let' declarations and return the last expression
  const lastStatement = sourceWithoutTypes.split(";").pop()?.trim() || sourceWithoutTypes;
  return `(function() { ${sourceWithoutTypes}; return ${lastStatement}; })()`;
}

/**
 * Interprets source code by compiling and evaluating it.
 * @param source - The source code to interpret
 * @returns The exit code (number result of the compiled code)
 */
function interpret(source: string): number {
  const compiled = compile(source);
  return eval(compiled) as number;
}

export { interpret, compile };
