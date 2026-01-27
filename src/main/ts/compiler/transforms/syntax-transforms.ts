import {
  isWhitespace,
  matchWord,
  isIdentifierChar,
} from "../parsing/string-helpers";
import {
  transformMatch,
  transformLoop,
  transformWhile,
  transformFor,
  transformIfElse,
} from "./control-flow";
import { transformFunctionDeclarations } from "./function-transforms";
import { extractVarDeclarations } from "./var-extraction";
import {
  handleOpeningBrace,
  handleClosingBrace,
  handleLetDeclaration,
  handleTypeDeclaration,
  handleStructDeclaration,
  handleContractDeclaration,
} from "./helpers/brace-handlers";
import { tryControlFlowTransform } from "./helpers/transform-helpers";
import { transformIsOperator } from "./helpers/is-operator";

export { extractVarDeclarations };

function processFnDeclLine(
  source: string,
  i: number,
): { declaration: string; newIdx: number } | undefined {
  if (!matchWord(source, i, "fn")) return undefined;
  let j = i + 2;
  while (j < source.length && isWhitespace(source[j])) j++;
  const nameStart = j;
  while (j < source.length && isIdentifierChar(source[j])) j++;
  const fnName = source.slice(nameStart, j);
  while (j < source.length && source[j] !== ";") j++;
  const fnDef = source.slice(i + 2, j).trim();
  return {
    declaration:
      "const " + fnName + " = " + fnDef.slice(fnName.length).trim() + ";",
    newIdx: j + 1,
  };
}

function tryProcessBraces(
  sourceAfterFn: string,
  i: number,
  parenDepth: number,
  braceDepth: number,
  result: string,
): {
  processed: boolean;
  result?: string;
  braceDepth?: number;
  newIdx?: number;
} {
  const openResult = handleOpeningBrace(
    sourceAfterFn,
    i,
    parenDepth,
    braceDepth,
    result,
  );
  if (openResult) {
    return {
      processed: true,
      result: openResult.result,
      braceDepth: openResult.braceDepth,
      newIdx: i + 1,
    };
  }

  const closeResult = handleClosingBrace(
    sourceAfterFn,
    i,
    parenDepth,
    braceDepth,
    result,
  );
  return closeResult
    ? {
        processed: true,
        result: closeResult.result,
        braceDepth: closeResult.braceDepth,
        newIdx: i + 1,
      }
    : { processed: false };
}

type ProcessResult = {
  processed: boolean;
  result?: string;
  braceDepth?: number;
  newIdx?: number;
};

function tryProcessDeclarations(
  src: string,
  i: number,
  braceDepth: number,
  result: string,
): ProcessResult {
  const fnDecl = processFnDeclLine(src, i);
  if (fnDecl)
    return {
      processed: true,
      result: result + fnDecl.declaration,
      braceDepth,
      newIdx: fnDecl.newIdx,
    };
  const typeDecl = handleTypeDeclaration(src, i);
  if (typeDecl)
    return {
      processed: true,
      result: result + typeDecl.result,
      braceDepth,
      newIdx: typeDecl.endIdx,
    };
  const structDecl = handleStructDeclaration(src, i);
  if (structDecl)
    return {
      processed: true,
      result: result + structDecl.result,
      braceDepth,
      newIdx: structDecl.endIdx,
    };
  const contractDecl = handleContractDeclaration(src, i);
  if (contractDecl)
    return {
      processed: true,
      result: result + contractDecl.result,
      braceDepth,
      newIdx: contractDecl.endIdx,
    };
  if (matchWord(src, i, "let")) {
    const { result: r, endIdx } = handleLetDeclaration(src, i);
    return { processed: true, result: result + r, braceDepth, newIdx: endIdx };
  }
  return { processed: false };
}

function processBracesAndSyntax(
  sourceAfterFn: string,
  i: number,
  parenDepth: number,
  braceDepth: number,
  result: string,
): ProcessResult {
  const braceResult = tryProcessBraces(
    sourceAfterFn,
    i,
    parenDepth,
    braceDepth,
    result,
  );
  if (braceResult.processed) return braceResult;
  return tryProcessDeclarations(sourceAfterFn, i, braceDepth, result);
}

/**
 * Remove Tuff-specific syntax like let, mut, type annotations
 */
export function removeTypeSyntax(source: string): string {
  // First transform 'is' operator before other transforms
  const sourceWithIs = transformIsOperator(source);
  const sourceAfterFn = transformFunctionDeclarations(sourceWithIs);
  let result = "";
  let i = 0;
  let parenDepth = 0;
  let braceDepth = 0;

  while (i < sourceAfterFn.length) {
    if (sourceAfterFn[i] === "(") parenDepth++;
    else if (sourceAfterFn[i] === ")") parenDepth--;

    const processed = processBracesAndSyntax(
      sourceAfterFn,
      i,
      parenDepth,
      braceDepth,
      result,
    );

    if (processed.processed) {
      result = processed.result!;
      braceDepth = processed.braceDepth!;
      i = processed.newIdx!;
    } else {
      result += sourceAfterFn[i];
      i++;
    }
  }
  return result;
}

export function transformControlFlow(source: string): string {
  let result = "";
  let i = 0;

  while (i < source.length) {
    const {
      handled,
      result: transformed,
      endIdx,
    } = tryControlFlowTransform(source, i, {
      match: () => transformMatch(source, i),
      loop: () => transformLoop(source, i),
      while: () => transformWhile(source, i),
      for: () => transformFor(source, i),
      if: () => transformIfElse(source, i, transformControlFlow),
    });

    if (handled) {
      result += transformed;
      i = endIdx;
    } else {
      result += source[i];
      i++;
    }
  }

  return result;
}
