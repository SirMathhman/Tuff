import { matchWord, isWhitespace } from "./parsing/string-helpers";
import {
  validateVariableUsage,
  clearDroppableTypes,
  clearDropHandlers,
  clearTypeAliases,
  clearVariableTypes,
  clearMovedVariables,
  clearDeclaredTypes,
  parseLetDeclaration,
} from "./parsing/parser-utils";
import { clearCompileFunctionDefs } from "./storage/function-defs-storage";
import { clearCompileStructDefs } from "./storage/struct-defs-storage";
import {
  skipToNextStatement,
  skipWhitespaceOnly,
} from "./parsing/declaration-helpers";
import {
  registerVariable,
  type VariableInfo,
} from "./declaration-parser-helpers";
import { processDeclarationKeyword } from "./declaration-handlers";

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
      return skipToNextStatement(source, decl.nextIndex);
    }
  }
  return skipToNextStatement(source, i);
}

function parseDeclarationsImpl(
  source: string,
  variables: Map<string, VariableInfo>,
): void {
  for (let i = 0; i < source.length; ) {
    i = skipWhitespaceOnly(source, i);
    if (i >= source.length) break;

    const char = source[i];
    if (char === "{" || char === "}") {
      i++;
      continue;
    }

    if (matchWord(source, i, "for")) {
      i = handleForLoop(source, i, variables);
      continue;
    }
    const result = processDeclarationKeyword(source, i, variables);
    i = result !== -1 ? result : skipToNextStatement(source, i);
  }
  validateVariableUsage(source, variables);
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
      clearCompileFunctionDefs();
      clearCompileStructDefs();
      clearVariableTypes();
      clearDroppableTypes();
      clearDropHandlers();
      clearTypeAliases();
      clearMovedVariables();
      clearDeclaredTypes();
      parseDeclarationsImpl(source, variables);
    },
  };
}
