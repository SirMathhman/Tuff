import { isWhitespace, matchWord } from "./parsing/string-helpers";
import {
  parseLetDeclaration,
  validateVariableUsage,
  parseTypeDeclaration,
} from "./parsing/parser-utils";

interface VariableInfo {
  type: string | undefined;
  mutable: boolean;
  initialized: boolean;
  isArray?: boolean;
}

function registerVariable(
  varName: string,
  typeAnnotation: string | undefined,
  isMutable: boolean,
  variables: Map<string, VariableInfo>,
  isArray?: boolean,
): void {
  if (variables.has(varName)) {
    throw new Error(`Variable '${varName}' already declared`);
  }
  variables.set(varName, {
    type: typeAnnotation,
    mutable: isMutable,
    initialized: true,
    isArray,
  });
}

function handleForLoop(
  source: string,
  i: number,
  variables: Map<string, VariableInfo>,
): number {
  i += 3;
  while (i < source.length && isWhitespace(source[i])) i++;
  if (i < source.length && source[i] === "(") {
    i++;
    while (i < source.length && isWhitespace(source[i])) i++;
    if (matchWord(source, i, "let")) {
      const decl = parseLetDeclaration(source, i);
      registerVariable(
        decl.varName,
        decl.typeAnnotation,
        decl.isMutable,
        variables,
      );
      i = decl.nextIndex;
      while (i < source.length && source[i] !== ";") {
        i++;
      }
      if (i < source.length) i++;
      return i;
    }
  }
  while (i < source.length && source[i] !== ";") {
    i++;
  }
  if (i < source.length) i++;
  return i;
}

function skipToNextStatement(source: string, i: number): number {
  while (i < source.length && source[i] !== ";") {
    i++;
  }
  if (i < source.length) i++;
  return i;
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

        if (source[i] === "{" || source[i] === "}") {
          i++;
          continue;
        }

        if (matchWord(source, i, "for")) {
          i = handleForLoop(source, i, variables);
          continue;
        }

        if (matchWord(source, i, "type")) {
          const decl = parseTypeDeclaration(source, i);
          i = decl.nextIndex;
          continue;
        }

        if (matchWord(source, i, "let")) {
          const decl = parseLetDeclaration(source, i);
          registerVariable(
            decl.varName,
            decl.typeAnnotation,
            decl.isMutable,
            variables,
            decl.isArray,
          );
          i = decl.nextIndex;
          continue;
        }

        i = skipToNextStatement(source, i);
      }

      validateVariableUsage(source, variables);
    },
  };
}
