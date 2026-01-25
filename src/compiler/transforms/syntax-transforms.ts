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
} from "./helpers/brace-handlers";
import { tryControlFlowTransform } from "./helpers/transform-helpers";

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

function processBracesAndSyntax(
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
  const braceResult = tryProcessBraces(
    sourceAfterFn,
    i,
    parenDepth,
    braceDepth,
    result,
  );
  if (braceResult.processed) return braceResult;

  const fnDecl = processFnDeclLine(sourceAfterFn, i);
  if (fnDecl) {
    return {
      processed: true,
      result: result + fnDecl.declaration,
      braceDepth,
      newIdx: fnDecl.newIdx,
    };
  }

  if (matchWord(sourceAfterFn, i, "let")) {
    const { result: letResult, endIdx } = handleLetDeclaration(
      sourceAfterFn,
      i,
    );
    return {
      processed: true,
      result: result + letResult,
      braceDepth,
      newIdx: endIdx,
    };
  }

  return { processed: false };
}

/**
 * Remove Tuff-specific syntax like let, mut, type annotations
 */
export function removeTypeSyntax(source: string): string {
  const sourceAfterFn = transformFunctionDeclarations(source);
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
