import { isWhitespace, matchWord } from "./parsing/string-helpers";
import {
  parseLetDeclaration,
  validateVariableUsage,
} from "./parsing/parser-utils";

interface VariableInfo {
  type: string | undefined;
  mutable: boolean;
  initialized: boolean;
}

/**
 * Factory function to create a declaration parser
 */
export function createDeclarationParser(
  source: string,
  variables: Map<string, VariableInfo>,
) {
  return {
    parseDeclarations() {
      let i = 0;

      while (i < source.length) {
        while (i < source.length && isWhitespace(source[i])) {
          i++;
        }

        if (i >= source.length) break;

        // Skip braces - they don't affect variable declarations
        if (source[i] === "{" || source[i] === "}") {
          i++;
          continue;
        }

        if (matchWord(source, i, "let")) {
          const decl = parseLetDeclaration(source, i);
          if (variables.has(decl.varName)) {
            throw new Error(`Variable '${decl.varName}' already declared`);
          }
          variables.set(decl.varName, {
            type: decl.typeAnnotation,
            mutable: decl.isMutable,
            initialized: true,
          });
          i = decl.nextIndex;
          continue;
        }

        // Skip to next statement
        while (i < source.length && source[i] !== ";") {
          i++;
        }
        if (i < source.length) i++;
      }

      // Second pass: check for undeclared variable usage
      validateVariableUsage(source, variables);
    },
  };
}
