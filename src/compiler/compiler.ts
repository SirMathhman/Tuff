import { createDeclarationParser } from "./declaration-parser";
import {
  removeTypeSyntax,
  extractVarDeclarations,
  replaceBooleanLiterals,
  stripTypeAnnotationsAndValidate,
  convertStatementsToExpressions,
} from "./syntax-transforms";

interface VariableInfo {
  type: string | undefined;
  mutable: boolean;
  initialized: boolean;
}

/**
 * Factory function to create a Tuff compiler
 */
function createTuffCompiler(source: string) {
  const variables: Map<string, VariableInfo> = new Map();

  return {
    compile(): string {
      // Pass 1: Parse variable declarations
      const parser = createDeclarationParser(source, variables);
      parser.parseDeclarations();

      // Pass 2: Strip Tuff syntax
      const js = removeTypeSyntax(source);

      // Pass 3: Extract variables that need declaration
      const { expression, varDeclarations } = extractVarDeclarations(js);

      // Pass 4: Transform literals
      let transformedExpr = replaceBooleanLiterals(expression);
      transformedExpr = stripTypeAnnotationsAndValidate(transformedExpr);

      // Convert semicolons to commas for eval (statements to expressions)
      transformedExpr = convertStatementsToExpressions(transformedExpr);

      // Wrap in a function with var declarations
      const varDeclString =
        varDeclarations.length > 0 ? `var ${varDeclarations.join(", ")};` : "";

      return `(function() { ${varDeclString} return (${transformedExpr}); })()`;
    },
  };
}

/**
 * Compile Tuff source code to JavaScript string
 * @param _source Tuff source code
 * @returns JavaScript code as a string
 */
export function compile(_source: string): string {
  const source = _source.trim();

  // Empty source compiles to empty script
  if (!source) {
    return "";
  }

  // Parse and compile the source
  const compiler = createTuffCompiler(source);
  return compiler.compile();
}

/**
 * Execute Tuff source code by compiling and evaluating
 * @param source Tuff source code
 * @returns The numeric result of execution
 */
export function execute(source: string): number {
  const js = compile(source);
  const result = eval(js);
  return typeof result === "number" ? result : 0;
}
