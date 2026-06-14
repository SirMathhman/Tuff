import type { ScopeValue } from "./types.js";
import { splitStatements } from "./shared-state.js";
import { extractIdentifier, isDeclarationStart } from "./string-utils.js";
import {
  evaluateExpression,
  inferExpressionType,
} from "./parser-expressions.js";
import { isSafeWiden } from "./type-utils.js";
import { setResolveBlocks } from "./parser-expressions.js";
import {
  processBlock,
  processFnDefinition,
  resolveBlocksWithScope,
  evaluateBlockWithScope,
  isFnDefinition,
  isTypeAlias,
} from "./evaluator-statements.js";
import { parseDeclaration } from "./parser-declarations.js";
import { replaceInnermostBlocks } from "./char-utils.js";

// Wire up the circular dependency: parser needs resolveBlocksWithScope at runtime.
setResolveBlocks(resolveBlocksWithScope);

/** Reject unsupported declaration keywords (`var`, `const`). */
function checkUnsupportedKeywords(input: string): void {
  const trimmed = input.trim();
  // Check each statement part for var/const usage
  for (const part of splitStatements(trimmed)) {
    const kw = extractIdentifier(part);
    if (kw === "var" || kw === "const") {
      throw new Error("Unsupported keyword: " + kw + ". Use 'let' instead.");
    }
  }
}

/** Check if input contains multiple statements (semicolon-separated). */
function hasMultipleStatements(input: string): boolean {
  return splitStatements(input).length > 1;
}

/** Evaluate a block's inner content. */
function evaluateBlock(inner: string): number {
  const scope = new Map<string, ScopeValue>();
  return evaluateBlockWithScope(inner, scope);
}

export function executeTuff(source: string): number {
  if (source.trim() === "") return 0;

  try {
    const result = evaluate(source);
    if (typeof result !== "number" || isNaN(result))
      throw new Error("Not a number");
    return result;
  } catch {
    throw new Error("Default error, invalid source: " + source);
  }
}

function evaluate(source: string): number {
  const trimmed = source.trim();

  // Handle block syntax { ... }: only when the entire string is a single pair of braces
  if (
    trimmed.startsWith("{") &&
    trimmed.endsWith("}") &&
    !trimmed.slice(1).includes("{")
  ) {
    return evaluateBlock(trimmed.slice(1, -1));
  }

  // Handle top-level statements: `let x = ...; expr`, standalone fn defs, type aliases
  if (
    isDeclarationStart(trimmed) ||
    hasMultipleStatements(trimmed) ||
    isFnDefinition(trimmed) ||
    isTypeAlias(trimmed)
  ) {
    checkUnsupportedKeywords(trimmed);
    const scope = new Map<string, ScopeValue>();
    // Standalone fn definition: validate params then return 0
    if (isFnDefinition(trimmed) && !hasMultipleStatements(trimmed)) {
      const fnScope = new Map<string, ScopeValue>();
      processFnDefinition(trimmed, fnScope);
      return 0;
    }
    const parts: string[] = splitStatements(trimmed);
    processBlock(scope, parts);
    const lastPart = parts[parts.length - 1]!;
    // If the last part is a declaration/definition (not an expression), validate types then return 0
    if (isDeclarationStart(lastPart) || isFnDefinition(lastPart)) {
      // Validate type annotations for declarations
      const declResult = parseDeclaration(lastPart);
      if (
        declResult &&
        declResult.typeAnnot &&
        !declResult.rhs.trim().startsWith("[") &&
        !declResult.rhs.trim().startsWith("(")
      ) {
        const inferredType = inferExpressionType(
          declResult.rhs,
          scope as unknown as Map<string, ScopeValue>,
        );
        if (inferredType && !isSafeWiden(inferredType, declResult.typeAnnot)) {
          throw new Error(
            "Type mismatch: expected " +
              declResult.typeAnnot +
              " but got " +
              inferredType,
          );
        }
      }
      return 0;
    }
    return resolveBlocksWithScope(lastPart, scope);
  }

  // Replace empty blocks {} with 0 (Void functions return 0)
  const noEmptyBlocks = replaceEmptyBlocks(trimmed);

  // Find any { ... } blocks in the expression and recursively resolve them
  let resolved = noEmptyBlocks;
  let prev: string;
  do {
    prev = resolved;
    resolved = replaceInnermostBlocks(resolved, function (inner) {
      return String(evaluateBlock(inner));
    });
  } while (resolved !== prev && resolved.indexOf("{") !== -1);

  // Evaluate the resulting expression
  return evaluateExpression(resolved);
}

/** Replace `{}` with `0` in a string. */
function replaceEmptyBlocks(s: string): string {
  let result = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "{" && i + 1 < s.length && s[i + 1] === "}") {
      result += "0";
      i += 2;
    } else {
      result += s[i];
      i++;
    }
  }
  return result;
}
