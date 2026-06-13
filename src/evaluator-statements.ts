import type { ScopeValue } from "./types.js";
import { tokenize } from "./tokenizer.js";
import {
  MUTABLE_VARS,
  POINTER_TARGETS,
  NON_ZERO_VARS,
  splitStatements,
  getMutableSet,
  getTypeAnnotations,
  getPointerTargets,
  getNonZeroSet,
  isObjectLiteral,
} from "./shared-state.js";
import {
  evaluateExpression,
  inferExpressionType,
  parseValue,
  isSafeWiden,
  parseObjectLiteral,
} from "./parser-expressions.js";

/** Check if a block contains only statements (assignments/declarations). */
function isStatementBlock(inner: string): boolean {
  if (isObjectLiteral(inner)) return false;
  const parts = splitStatements(inner);
  if (parts.length === 0) return false;
  for (const p of parts) {
    if (!isAssignment(p.trim()) && !/^\s*(?:let|const|var)\s/.test(p))
      return false;
  }
  return true;
}

/** Evaluate a block's inner content with an existing scope. */
export function evaluateBlockWithScope(
  inner: string,
  scope: Map<string, ScopeValue>,
): number {
  const parts = splitStatements(inner);
  if (parts.length === 0) throw new Error("Empty block");

  processBlock(scope, parts);
  // If the last part is an assignment or declaration, return resolved value from scope instead of re-evaluating
  const lastPart = parts[parts.length - 1];
  if (isAssignment(lastPart!) || /^\s*(?:let|const|var)\s/.test(lastPart!)) {
    // Extract identifier name and resolve its current value
    const idMatch = lastPart!.match(/^(\w+)/);
    if (idMatch) {
      const name = idMatch[1]!;
      if (scope.has(name)) {
        const val = scope.get(name);
        return typeof val === "number" ? val : 0;
      }
    }
  }
  return resolveBlocksWithScope(lastPart!, scope);
}

/** Parse a declaration, supporting simple types (`I32`), pointer types (`*I32`), type aliases (`Point`), refinement types (`5U8`, `U8 != 0`), and struct types. */
function parseDeclaration(
  input: string,
): { name: string; typeAnnot?: string; rhs: string } | null {
  // Try non-zero refinement pattern: `let x : U8 != 0 = ...`
  const nzMatch = input.match(
    /^(?:let|const|var)\s+(?:(?:mut)\s+)?(\w+)\s*:\s*(\*?)?([A-Za-z]\w*)\s*!=\s*0\s*=\s*(.+)$/,
  );
  if (nzMatch && nzMatch[1] && nzMatch[4]) {
    const pointerPrefix = nzMatch[2]; // "*" or undefined
    const baseType = nzMatch[3]; // "U8", "I32", etc.
    return {
      name: nzMatch[1],
      typeAnnot: `${(pointerPrefix ?? "") + (baseType ?? "")} != 0`,
      rhs: nzMatch[4],
    };
  }

  // Try pattern with a simple or alias type (any identifier), optionally prefixed with * for pointer types
  const simpleMatch = input.match(
    /^(?:let|const|var)\s+(?:(?:mut)\s+)?(\w+)\s*(?::\s*(\*?)([A-Za-z]\w*))?\s*=\s*(.+)$/,
  );
  if (simpleMatch && simpleMatch[1] && simpleMatch[4]) {
    const pointerPrefix = simpleMatch[2]; // "*" or undefined
    const baseType = simpleMatch[3]; // "I32", "Point", etc.
    return {
      name: simpleMatch[1],
      typeAnnot: (pointerPrefix ?? "") + (baseType ?? ""),
      rhs: simpleMatch[4],
    };
  }

  // Try refinement type: `let x : 5U8 = ...` (numeric literal with optional suffix as type annotation)
  const refMatch = input.match(
    /^(?:let|const|var)\s+(?:(?:mut)\s+)?(\w+)\s*:\s*(-?[0-9]+(?:\.[0-9]+)?)([A-Za-z]\w*)?\s*=\s*(.+)$/,
  );
  if (refMatch && refMatch[1] && refMatch[4]) {
    const numPart = refMatch[2]; // "5", "-3.14", etc.
    const suffixPart = refMatch[3]; // "U8", "I32", or undefined
    return {
      name: refMatch[1],
      typeAnnot: `${numPart}${suffixPart ?? ""}`,
      rhs: refMatch[4],
    };
  }

  // Fallback for struct-typed declarations like `let point : { x : I32, y : I32 } = ...`
  const structPrefix = input.match(
    /^(?:let|const|var)\s+(?:(?:mut)\s+)?(\w+)\s*:\s*\{/,
  );
  if (!structPrefix) return null;

  // Simpler approach: find first `=` outside of braces, starting after the prefix match
  const remainder = input.slice(structPrefix[0].length);
  let braceDepth = 1;
  for (let i = 0; i < remainder.length; i++) {
    if (remainder[i] === "{") braceDepth++;
    else if (remainder[i] === "}") braceDepth--;
    else if (remainder[i] === "=" && braceDepth === 0) {
      const rhs = remainder.slice(i + 1).trim();
      return {
        name: structPrefix[1]!,
        typeAnnot: undefined /* struct types not validated yet */,
        rhs,
      };
    }
  }

  return null;
}

/** Check if a string is an assignment like `x = expr`, `arr[0] = expr`, or `x += 1`. */
export function isAssignment(input: string): boolean {
  return /^\w+(?:\s*\[[^\]]+\])*\s*[+-]?\s*=/.test(input.trim());
}

/** Evaluate an assignment statement like `x = 3`, `arr[0] = 100`, or `x += 1`. */
function evaluateAssignment(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const match = input.match(/^(\w+)(.*)\s*[+-]?\s*=\s*(.+)$/);
  if (match && match[1] && typeof match[2] === "string" && match[3]) {
    const name = match[1];
    // Detect compound assignment operator, normalizing whitespace within the operator
    const opMatch = input.match(/\s*([+-])\s*=\s*/);
    const isCompoundOp = !!opMatch;
    const compoundOp = isCompoundOp ? opMatch![1] + "=" : "";

    // Extract indices from the middle part like [0][1]
    const idxMatch = match[2].match(/\[(\d+)\]/g) ?? [];

    if (idxMatch.length === 0) {
      // Plain or compound assignment: `x = value` or `x += value`
      // Check mutability before allowing any assignment to a plain variable
      const mutableSet = getMutableSet(scope);
      if (!mutableSet.has(name)) {
        throw new Error(`Cannot assign to immutable variable: ${name}`);
      }

      if (!isCompoundOp) {
        scope.set(name, parseValue(match[3], scope));
        return;
      }

      // Compound assignment: read current value and apply operator
      const rhsValue = resolveBlocksWithScope(match[3], scope);
      const currentValue = scope.get(name);
      const numCurrent = typeof currentValue === "number" ? currentValue : 0;
      if (compoundOp === "+=") {
        scope.set(name, numCurrent + rhsValue);
      } else if (compoundOp === "-=") {
        scope.set(name, numCurrent - rhsValue);
      }
      return;
    }

    // Indexed assignment: ensure target is an array
    const arr = scope.get(name);
    if (!Array.isArray(arr)) throw new Error("Cannot index non-array");

    // Walk to parent and set at final index
    let current: unknown[] = arr;
    for (let i = 0; i < idxMatch.length - 1; i++) {
      const ci = parseInt(idxMatch[i]!.slice(1, -1), 10);
      current = current[ci] as unknown[];
    }
    const finalIdx = parseInt(idxMatch.at(-1)!.slice(1, -1), 10);

    if (!isCompoundOp) {
      current[finalIdx] = parseValue(match[3], scope);
      return;
    }

    // Compound indexed assignment: read current value and apply operator
    const rhsValue = resolveBlocksWithScope(match[3], scope);
    const numCurrent =
      typeof current[finalIdx] === "number" ? current[finalIdx] : 0;
    if (compoundOp === "+=") {
      current[finalIdx] = numCurrent + rhsValue;
    } else if (compoundOp === "-=") {
      current[finalIdx] = numCurrent - rhsValue;
    }
  }
}

/** Process a single statement in the given scope. */
function processSingleStatement(
  part: string,
  scope: Map<string, ScopeValue>,
): void {
  // Handle let/const/var declarations
  const declResult = parseDeclaration(part);
  if (declResult) {
    const name = declResult.name;
    let typeAnnot = declResult.typeAnnot;

    // Detect non-zero refinement: `type != 0` annotations
    const isNonZeroRefinement = /!=\s*0$/.test(typeAnnot ?? "");

    // Detect value refinement types: annotations starting with a digit or minus sign, e.g. "5U8", "-3I16"
    const isValueRefinementType = /^-?[0-9]/.test(typeAnnot ?? "");

    // Strip pointer prefix (*) and non-zero refinement (!= 0) before checking built-in vs alias types
    const baseType =
      typeAnnot
        ?.replace(/^\*/, "")
        ?.replace(/!=\s*0$/, "")
        .trim() ?? "";
    const isBuiltInType = /^[A-Z][0-9]/.test(baseType);
    if (typeAnnot && !isBuiltInType) {
      const aliasValue = scope.get("__type__" + typeAnnot);
      // If it's a struct alias and RHS is an object literal, skip strict validation
      if (aliasValue !== undefined) {
        getTypeAnnotations(scope).set(name, "struct");
        typeAnnot = undefined; /* treat as untyped for widening purposes */
      } else {
        getTypeAnnotations(scope).set(name, typeAnnot);
      }
    } else if (typeAnnot) {
      getTypeAnnotations(scope).set(name, typeAnnot);
    }

    const rhs = declResult.rhs;
    // Infer and store RHS type for simple numeric expressions so variable references carry types
    let inferredRhsType: string | undefined;
    if (
      !/^\s*\[/.test(rhs) &&
      !isObjectLiteral(rhs) &&
      !rhs.trim().startsWith("{") &&
      !/^&\s*/.test(rhs)
    ) {
      inferredRhsType = inferExpressionType(
        rhs,
        scope as unknown as Map<string, ScopeValue>,
      );
    }
    // Store the effective type (annotation wins over inference for widening purposes)
    // For refinement types like "5U8" or "U8 != 0", extract just the base type ("U8") for widening checks
    let effectiveType =
      typeAnnot
        ?.replace(/^\*/, "")
        ?.replace(/!=\s*0$/, "")
        .trim() ?? undefined;
    if (isValueRefinementType && effectiveType) {
      const refBaseMatch = effectiveType.match(
        /^-?[0-9]+(?:\.[0-9]+)?([A-Za-z]\w*)?$/,
      );
      effectiveType = refBaseMatch ? (refBaseMatch[1] ?? undefined) : undefined;
    }
    if (effectiveType) {
      getTypeAnnotations(scope).set(name, effectiveType);
    } else if (inferredRhsType) {
      getTypeAnnotations(scope).set(name, inferredRhsType);
    }
    // Validate RHS type matches annotation for non-array/object expressions
    if (
      effectiveType &&
      inferredRhsType &&
      !isSafeWiden(inferredRhsType, effectiveType as string)
    ) {
      throw new Error(
        `Type mismatch: expected ${effectiveType} but got ${inferredRhsType}`,
      );
    }
    // Track mutability: check for 'mut' keyword
    const isMutable = /^\s*(?:let|const|var)\s+mut\s+/.test(part);
    if (isMutable) {
      getMutableSet(scope).add(name);
    }
    let value: unknown;
    // Check for address-of expression (&<varname>) — store pointer target and resolve to current value
    const addrOfMatch = rhs.trim().match(/^&\s*(\w+)\s*$/);
    if (addrOfMatch) {
      const targetVarName = addrOfMatch[1]!;
      getPointerTargets(scope).set(name, targetVarName);
      // Store the current value of the target variable
      value = scope.get(targetVarName);
      if (value === undefined)
        throw new Error(
          `Cannot take address of undefined variable: ${targetVarName}`,
        );
    } else if (/^\s*\[/.test(rhs)) {
      // Array literal - parse directly to preserve array structure
      value = parseValue(rhs, scope);
    } else if (isObjectLiteral(rhs) || /^\s*\{[^}]*\s*:\s*/.test(rhs)) {
      // Object literal - strip outer braces and parse as object
      const inner = rhs.trim();
      const stripped =
        inner.startsWith("{") && inner.endsWith("}")
          ? inner.slice(1, -1)
          : inner;
      const tokens = tokenize(stripped);
      value = parseObjectLiteral(tokens, [0], scope);
    } else {
      // Expression or block - resolve blocks first then evaluate
      value = resolveBlocksWithScope(rhs, scope);
    }

    // Track non-zero refined variables for division safety checks
    if (isNonZeroRefinement) {
      getNonZeroSet(scope).add(name);
    }

    // Validate refinement type: the resolved value must match the exact expected value+type
    if (isValueRefinementType && typeof value === "number") {
      const refNumMatch = typeAnnot!.match(
        /^(-?[0-9]+(?:\.[0-9]+)?)([A-Za-z]\w*)?$/,
      );
      if (refNumMatch && refNumMatch[1]) {
        const expectedValue = parseFloat(refNumMatch[1]);
        const expectedType = refNumMatch[2] ?? "I32";
        if (value !== expectedValue) {
          throw new Error(
            `Refinement type violation: expected ${expectedValue} but got ${value}`,
          );
        }
        // Also validate the inferred type matches
        const actualType = getTypeAnnotations(scope).get(name);
        if (!isSafeWiden(actualType ?? "I32", expectedType)) {
          throw new Error(
            `Refinement type mismatch: expected ${expectedType} but got ${actualType}`,
          );
        }
      }
    }

    scope.set(name, value);
  } else if (part.startsWith("{") && part.endsWith("}")) {
    // Nested block: use child scope so declarations don't leak outward
    const innerParts = splitStatements(part.slice(1, -1));
    processNestedBlock(innerParts, scope);
  } else if (isAssignment(part)) {
    evaluateAssignment(part, scope);
  } else {
    resolveBlocksWithScope(part, scope);
  }
}

/** Check if a statement starts with an `if` keyword. */
function isIfStatement(input: string): boolean {
  return /^\s*if\s*\(/.test(input.trim());
}

/** Check if a statement starts with an `else` keyword. */
function isElseStatement(input: string): boolean {
  return /^\s*else\b/.test(input.trim());
}

/** Check if a statement starts with a `while` keyword. */
function isWhileStatement(input: string): boolean {
  return /^\s*while\s*\(/.test(input.trim());
}

/** Check if a statement starts with a `for` keyword. */
function isForStatement(input: string): boolean {
  return /^\s*for\s*\(.*in/.test(input.trim());
}

/** Check if a statement is a function definition like `fn name() => expr`. */
export function isFnDefinition(input: string): boolean {
  return /^\s*fn\s+\w+\s*\([^)]*\)(?:\s*:\s*(?:[A-Za-z]\d*|Void))?\s*=>\s*/.test(
    input.trim(),
  );
}

/** Check if a statement is a type alias like `type Point = { x : I32, y : I32 }`. */
export function isTypeAlias(input: string): boolean {
  return /^\s*type\s+\w+\s*=/.test(input.trim());
}

/** Process a type alias statement and store it in scope. */
function processTypeAlias(
  input: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scope: Map<string, any>,
): void {
  const match = input.match(/^\s*type\s+(\w+)\s*=\s*(.+)$/);
  if (!match || !match[1] || typeof match[2] !== "string") return;
  // Store type alias as a string under __type__ prefix
  scope.set("__type__" + match[1], match[2].trim());
}

/** Process a function definition statement and store it in scope with parameter names. */
export function processFnDefinition(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const match = input.match(
    /^\s*fn\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(?:[A-Za-z]\d*|Void))?\s*=>\s*(.+)$/,
  );
  if (!match || !match[1] || typeof match[2] !== "string" || !match[3]) return;
  // Strip type annotations from params (e.g. "first : I32" -> "first")
  const params = match[2].trim()
    ? match[2]
        .split(",")
        .map((p) => p.trim())
        .map((p) => {
          // Handle typed array params like "array : [I32; 2]" -> extract just the name
          const arrMatch = p.match(/^(\w+)\s*:\s*\[/);
          if (arrMatch) return arrMatch[1];
          // Regular typed param: "name : Type" -> "name"
          const colonIdx = p.indexOf(":");
          return colonIdx >= 0 ? p.substring(0, colonIdx).trim() : p;
        })
    : [];
  // Check for duplicate parameter names
  const seenParams = new Set(params);
  if (seenParams.size !== params.length) {
    throw new Error("Duplicate parameter name");
  }
  // Store function as an object with body and parameters
  scope.set("__fn__" + match[1], { body: match[3].trim(), params });
}

/** Maximum number of iterations for while loops to prevent infinite loops. */
const MAX_WHILE_ITERATIONS = 1024;

/** Process a `while (cond) body` statement, executing the loop up to MAX_WHILE_ITERATIONS times. */
function processWhileStatement(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const match = input.match(/^\s*while\s*\((.+)\)\s*(.*)$/);
  if (!match || !match[1] || typeof match[2] !== "string") return;

  const condExpr = match[1].trim();
  const body = match[2].trim();

  let iterations = 0;
  while (iterations < MAX_WHILE_ITERATIONS) {
    const condValue = resolveBlocksWithScope(condExpr, scope);
    if (condValue === 0) break; // false condition: exit loop
    processSingleStatement(body, scope);
    iterations++;
  }
}

/** Process a `for (var in start..end) body` statement. */
function processForStatement(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const match = input.match(/^\s*for\s*\((.+?)\)\s*(.*)$/);
  if (!match || !match[1]) return;

  const header = match[1].trim();
  const body = (match[2] ?? "").trim();

  // Parse `var in start..end`
  const rangeMatch = header.match(/^(\w+)\s+in\s+(.+?)\.\.(.+)$/);
  if (!rangeMatch || !rangeMatch[1] || !rangeMatch[2] || !rangeMatch[3]) return;

  const varName = rangeMatch[1].trim();
  const startVal = parseValue(rangeMatch[2].trim(), scope);
  const endVal = parseValue(rangeMatch[3].trim(), scope);

  if (typeof startVal !== "number" || typeof endVal !== "number") return;

  // Ensure the loop variable is tracked as mutable so compound assignments work
  getMutableSet(scope).add(varName);

  for (
    let i = Math.floor(startVal);
    i < Math.floor(endVal) && i - Math.floor(startVal) < MAX_WHILE_ITERATIONS;
    i++
  ) {
    scope.set(varName, i);
    processSingleStatement(body, scope);
  }
}

/** Process statements in a block, updating the scope. */
export function processBlock(
  scope: Map<string, ScopeValue>,
  parts: string[],
): void {
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (isIfStatement(part)) {
      // Check if next part is the matching `else` branch
      const nextPart = parts[i + 1];
      if (nextPart && isElseStatement(nextPart)) {
        processSingleIfElseStatement(part, nextPart.trim(), scope);
        i++; // skip else since we already consumed it
      } else {
        resolveBlocksWithScope(part, scope);
      }
    } else if (isWhileStatement(part)) {
      processWhileStatement(part, scope);
    } else if (isForStatement(part)) {
      processForStatement(part, scope);
    } else if (isFnDefinition(part)) {
      processFnDefinition(part, scope);
    } else if (isTypeAlias(part)) {
      processTypeAlias(part, scope);
    } else {
      processSingleStatement(part, scope);
    }
  }
}

/** Process an if/else statement pair. */
function processSingleIfElseStatement(
  ifPart: string,
  elsePart: string,
  scope: Map<string, ScopeValue>,
): void {
  // Extract condition from `if (cond) body`
  const match = ifPart.match(/^if\s*\((.+)\)\s*(.*)$/);
  if (!match || !match[1] || typeof match[2] !== "string") return;

  const condValue = resolveBlocksWithScope(match[1], scope);
  const body = match[2].trim();

  if (condValue !== 0) {
    // Execute then branch
    processSingleStatement(body, scope);
  } else {
    // Execute else branch: strip leading `else` keyword
    const stripped = elsePart.replace(/^\s*else\s+/, "");
    processSingleStatement(stripped.trim(), scope);
  }
}

/** Process a nested block with its own child scope. */
function processNestedBlock(
  innerParts: string[],
  outerScope: Map<string, ScopeValue>,
): void {
  // If the block has no declarations, just process directly on outer scope
  const hasDeclarations = innerParts.some((p) =>
    /^(?:let|const|var)\s+/.test(p.trim()),
  );
  if (!hasDeclarations) {
    for (const ip of innerParts) {
      processSingleStatement(ip, outerScope);
    }
    return;
  }

  // Child scope copies references from parent so lookups find inherited values
  const child = new Map(outerScope);
  // Also copy mutable variable tracking to the child scope
  MUTABLE_VARS.set(child, getMutableSet(outerScope));
  // Copy pointer target tracking to the child scope
  POINTER_TARGETS.set(child, getPointerTargets(outerScope));
  // Copy non-zero refinement tracking to the child scope
  NON_ZERO_VARS.set(child, getNonZeroSet(outerScope));
  for (const ip of innerParts) {
    processSingleStatement(ip, child);
  }
}

/** Resolve blocks in an expression and evaluate with a given scope. */
export function resolveBlocksWithScope(
  input: string,
  scope: Map<string, ScopeValue>,
): number {
  let resolved = input;
  // Recursively replace innermost blocks with their values (or empty if statement-only)
  // But skip object literals which have key:value patterns
  let prev: string;
  do {
    prev = resolved;
    resolved = prev.replace(/\{([^{}]+)\}/g, (_match, blockInner) => {
      const trimmed = blockInner.trim();
      // Skip object literals (have `key : value` pattern, with optional spaces around colon)
      if (/^\s*\w+\s*:\s*/.test(trimmed)) return _match;
      // If the block is purely statements (assignments/declarations), process for side effects only
      if (isStatementBlock(trimmed)) {
        const innerParts = splitStatements(trimmed);
        processNestedBlock(innerParts, scope);
        return "";
      }
      return String(evaluateBlockWithScope(trimmed, scope));
    });
  } while (resolved !== prev && /\{/.test(resolved));

  // Trim whitespace that may remain after block removal
  resolved = resolved.trim();

  // Empty expression (e.g. Void function body `{}`) returns 0
  if (!resolved) return 0;

  const evalScope = new Map(scope as unknown as Map<string, ScopeValue>);
  // Copy pointer target tracking to the evaluation scope
  POINTER_TARGETS.set(evalScope, getPointerTargets(scope));
  // Copy non-zero refinement tracking to the evaluation scope
  NON_ZERO_VARS.set(evalScope, getNonZeroSet(scope));
  return evaluateExpression(
    resolved,
    evalScope as unknown as Map<string, unknown>,
  );
}
