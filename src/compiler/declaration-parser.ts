import { StringHelpers } from "./string-helpers";
import { parseLetDeclaration, validateVariableUsage } from "./parser-utils";

interface VariableInfo {
  type: string | undefined;
  mutable: boolean;
  initialized: boolean;
}

export class DeclarationParser {
  private variables: Map<string, VariableInfo>;
  private source: string;

  constructor(source: string, variables: Map<string, VariableInfo>) {
    this.source = source;
    this.variables = variables;
  }

  parseDeclarations(): void {
    let i = 0;

    while (i < this.source.length) {
      while (
        i < this.source.length &&
        StringHelpers.isWhitespace(this.source[i])
      ) {
        i++;
      }

      if (i >= this.source.length) break;

      // Skip braces - they don't affect variable declarations
      if (this.source[i] === "{" || this.source[i] === "}") {
        i++;
        continue;
      }

      if (StringHelpers.matchWord(this.source, i, "let")) {
        const decl = parseLetDeclaration(this.source, i);
        if (this.variables.has(decl.varName)) {
          throw new Error(`Variable '${decl.varName}' already declared`);
        }
        this.variables.set(decl.varName, {
          type: decl.typeAnnotation,
          mutable: decl.isMutable,
          initialized: true,
        });
        i = decl.nextIndex;
        continue;
      }

      // Skip to next statement
      while (i < this.source.length && this.source[i] !== ";") {
        i++;
      }
      if (i < this.source.length) i++;
    }

    // Second pass: check for undeclared variable usage
    validateVariableUsage(this.source, this.variables);
  }
}

