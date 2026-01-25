import { createDeclarationParser } from "./declaration-parser";
import {
  removeTypeSyntax,
  extractVarDeclarations,
  transformControlFlow,
} from "./transforms/syntax-transforms";
import {
  replaceBooleanLiterals,
  stripTypeAnnotationsAndValidate,
  convertStatementsToExpressions,
  transformCharLiterals,
} from "./transforms/literal-transforms";
import { transformStringIndexing } from "./transforms/string-transforms";
import { validateTypedArithmetic } from "./transforms/type-arithmetic-validation";

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

      // Validate typed arithmetic operations before removing type syntax
      validateTypedArithmetic(source);

      // Pass 2: Transform control flow BEFORE removing braces
      // (if/else/loop/while/for/match need their braces)
      const transformed = transformControlFlow(source);

      // Pass 3: Strip Tuff syntax (let, mut, type annotations)
      const js = removeTypeSyntax(transformed);

      // Pass 4: Extract variables that need declaration
      const { expression, varDeclarations } = extractVarDeclarations(js);

      // Pass 5: Transform literals
      let transformedExpr = transformStringIndexing(expression);
      transformedExpr = transformCharLiterals(transformedExpr);
      transformedExpr = replaceBooleanLiterals(transformedExpr);
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
  return evalImpl(compile(source));
}

export function evalImpl(js: string) {
  const result = eval(js);
  if (typeof result === "boolean") {
    return result ? 1 : 0;
  }
  return typeof result === "number" ? result : 0;
}
