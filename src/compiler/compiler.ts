import { DeclarationParser } from "./declaration-parser";
import {
  removeTypeSyntax,
  extractVarDeclarations,
  replaceBooleanLiterals,
  stripTypeAnnotationsAndValidate,
  convertStatementsToExpressions,
} from "./syntax-transforms";

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
  const compiler = new TuffCompiler(source);
  return compiler.compile();
}

interface VariableInfo {
  type: string | undefined;
  mutable: boolean;
  initialized: boolean;
}

class TuffCompiler {
  private source: string;
  private variables: Map<string, VariableInfo> = new Map();

  constructor(source: string) {
    this.source = source;
  }

  compile(): string {
    // Pass 1: Parse variable declarations
    const parser = new DeclarationParser(this.source, this.variables);
    parser.parseDeclarations();

    // Pass 2: Strip Tuff syntax
    const js = removeTypeSyntax(this.source);

    // Pass 3: Extract variables that need declaration
    const { expression, varDeclarations } = extractVarDeclarations(js);

    // Pass 4: Transform literals
    let transformedExpr = replaceBooleanLiterals(expression);
    transformedExpr = stripTypeAnnotationsAndValidate(transformedExpr);

    // Convert semicolons to commas for eval (statements to expressions)
    transformedExpr = convertStatementsToExpressions(transformedExpr);

    // Wrap in a function with var declarations
    const varDeclString = varDeclarations.length > 0
      ? `var ${varDeclarations.join(", ")};`
      : "";

    return `(function() { ${varDeclString} return (${transformedExpr}); })()`;
  }
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
