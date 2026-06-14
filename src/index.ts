import type { ScopeValue } from "./types.js";
import { splitStatements } from "./shared-state.js";
import {
  evaluateExpression,
  inferExpressionType,
  isSafeWiden,
} from "./parser-expressions.js";
import { setResolveBlocks } from "./parser-expressions.js";
import {
  processBlock,
  processFnDefinition,
  resolveBlocksWithScope,
  evaluateBlockWithScope,
  isFnDefinition,
  isTypeAlias,
} from "./evaluator-statements.js";

// Wire up the circular dependency: parser needs resolveBlocksWithScope at runtime.
setResolveBlocks(resolveBlocksWithScope);

/** Reject unsupported declaration keywords (`var`, `const`). */
function checkUnsupportedKeywords(input: string): void {
  const trimmed = input.trim();
  // Check each statement part for var/const usage
  for (const part of splitStatements(trimmed)) {
    if (/^var\s/.test(part) || /^const\s/.test(part)) {
      throw new Error(
        `Unsupported keyword: ${part.match(/^(\w+)/)?.[1] ?? "unknown"}. Use 'let' instead.`,
      );
    }
  }
}

/** Check if a string looks like it starts with a statement keyword. */
function isStatement(input: string): boolean {
  return /^(?:let|const|var)\s/.test(input.trim());
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
    isStatement(trimmed) ||
    hasMultipleStatements(trimmed) ||
    isFnDefinition(trimmed) ||
    isTypeAlias(trimmed)
  ) {
    checkUnsupportedKeywords(trimmed);
    const scope = new Map<string, ScopeValue>();
    // Standalone fn definition: validate params then return 0
    if (isFnDefinition(trimmed) && !hasMultipleStatements(trimmed)) {
      const scope = new Map<string, ScopeValue>();
      processFnDefinition(trimmed, scope);
      return 0;
    }
    const parts: string[] = splitStatements(trimmed);
    processBlock(scope, parts);
    const lastPart = parts[parts.length - 1]!;
    // If the last part is a declaration/definition (not an expression), validate types then return 0
    if (isStatement(lastPart) || isFnDefinition(lastPart)) {
      // Validate type annotations for declarations
      const declMatch = lastPart.match(
        /^(?:let|const|var)\s+(?:(?:mut)\s+)?(\w+)\s*(?::\s*([A-Za-z]\d*))?\s*=\s*(.+)$/,
      );
      if (
        declMatch &&
        declMatch[2] &&
        typeof declMatch[3] === "string" &&
        !(/^\s*\[/.test(declMatch[3]) || /^\s*\(/.test(declMatch[3]))
      ) {
        const inferredType = inferExpressionType(
          declMatch[3],
          scope as unknown as Map<string, ScopeValue>,
        );
        if (inferredType && !isSafeWiden(inferredType, declMatch[2])) {
          throw new Error(
            `Type mismatch: expected ${declMatch[2]} but got ${inferredType}`,
          );
        }
      }
      return 0;
    }
    return resolveBlocksWithScope(lastPart, scope);
  }

  // Replace empty blocks {} with 0 (Void functions return 0)
  const noEmptyBlocks = trimmed.replace(/\{\s*\}/g, "0");

  // Find any { ... } blocks in the expression and recursively resolve them
  let resolved = noEmptyBlocks;
  let prev: string;
  do {
    prev = resolved;
    resolved = prev.replace(/\{([^{}]+)\}/g, (_match, inner) =>
      String(evaluateBlock(inner)),
    );
  } while (resolved !== prev && /\{/.test(resolved));

  // Evaluate the resulting expression
  return evaluateExpression(resolved);
}
