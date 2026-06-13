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
import { parseDeclaration } from "./parser-declarations.js";

/** Check for statement-only block. */
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

/** Evaluate block content with existing scope. */
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

/** Check for assignment pattern. */
export function isAssignment(input: string): boolean {
  return /^\w+(?:\s*\[[^\]]+\])*\s*[+-]?\s*=/.test(input.trim());
}

/** Evaluate assignment statement. */
function evaluateAssignment(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const match = input.match(/^(\w+)(.*)\s*[+-]?\s*=\s*(.+)$/);
  if (match && match[1] && typeof match[2] === "string" && match[3]) {
    const name = match[1];
    // Detect compound assignment
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
  const declResult = parseDeclaration(part);
  if (declResult) {
    const name = declResult.name;
    let typeAnnot = declResult.typeAnnot;

    // Detect non-zero refinement and value refinement types
    const isNonZeroRefinement = /!=\s*0$/.test(typeAnnot ?? "");
    const isValueRefinementType = /^-?[0-9]/.test(typeAnnot ?? "");

    // Strip pointer prefix (*) and non-zero refinement (!= 0) before checking built-in vs alias types
    let baseType =
      typeAnnot
        ?.replace(/^\*/, "")
        ?.replace(/!=\s*0$/, "")
        .trim() ?? "";
    const isBuiltInType = /^[A-Z][0-9]/.test(baseType);
    if (typeAnnot && !isBuiltInType) {
      // Strip != 0 suffix before trying to resolve generics
      const typeForResolve = baseType.replace(/!=\s*0$/, "").trim();
      const resolvedGeneric = resolveGenericType(typeForResolve, scope);
      if (resolvedGeneric !== undefined) {
        baseType = resolvedGeneric;
        typeAnnot = resolvedGeneric; // update for downstream effectiveType
        getTypeAnnotations(scope).set(name, baseType);
      } else {
        // Try regular alias lookup
        const aliasValue = scope.get("__type__" + typeAnnot);
        // If it's a struct alias and RHS is an object literal, skip strict validation
        if (aliasValue !== undefined) {
          getTypeAnnotations(scope).set(name, "struct");
          typeAnnot = undefined; /* treat as untyped for widening purposes */
        } else {
          getTypeAnnotations(scope).set(name, typeAnnot);
        }
      }
    } else if (typeAnnot) {
      getTypeAnnotations(scope).set(name, baseType);
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
    // Store effective type; annotation wins over inference for widening purposes
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
    // Address-of, array literal, object literal, or expression
    const addrOfMatch = rhs.trim().match(/^&\s*(\w+)\s*$/);
    if (addrOfMatch) {
      getPointerTargets(scope).set(name, addrOfMatch[1]!);
      value = scope.get(addrOfMatch[1]!);
      if (value === undefined)
        throw new Error(
          `Cannot take address of undefined variable: ${addrOfMatch[1]}`,
        );
    } else if (/^\s*\[/.test(rhs)) {
      // Array literal - parse directly to preserve array structure
      value = parseValue(rhs, scope);
    } else if (isObjectLiteral(rhs) || /^\s*\{[^}]*\s*:\s*/.test(rhs)) {
      // Object literal
      const stripped = rhs.trim();
      const inner =
        stripped.startsWith("{") && stripped.endsWith("}")
          ? stripped.slice(1, -1)
          : stripped;
      value = parseObjectLiteral(tokenize(inner), [0], scope);
    } else {
      // Expression or block - resolve blocks first then evaluate
      value = resolveBlocksWithScope(rhs, scope);
    }

    // Track non-zero refined variables for division safety checks
    if (isNonZeroRefinement) {
      getNonZeroSet(scope).add(name);
    }

    // Validate refinement type
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

/** Check if input matches various statement prefixes. */
const IS_IF = /^\s*if\s*\(/;
const IS_ELSE = /^\s*else\b/;
const IS_WHILE = /^\s*while\s*\(/;
const IS_FOR = /^\s*for\s*\(.*in/;

/** Check if a statement is a function definition like `fn name() => expr`. */
export function isFnDefinition(input: string): boolean {
  return /^\s*fn\s+\w+\s*\([^)]*\)(?:\s*:\s*(?:[A-Za-z]\d*|Void))?\s*=>\s*/.test(
    input.trim(),
  );
}

/** Check if a statement is a type alias like `type Point = { x : I32, y : I32 }` or generic `type Temp<T> = T`. */
export function isTypeAlias(input: string): boolean {
  return /^\s*type\s+\w+(?:<[^>]+>)?\s*=/.test(input.trim());
}

/** Process and store a type alias. Supports generics like `type Temp<T> = T`. */
function processTypeAlias(
  input: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scope: Map<string, any>,
): void {
  const match = input.match(/^\s*type\s+(\w+)(?:<([^>]+)>)?\s*=\s*(.+)$/);
  if (!match || !match[1] || typeof match[3] !== "string") return;
  scope.set("__type__" + match[1], match[3].trim());
}

/** Resolve generic type like `Temp<I32>` by looking up alias and substituting params. */
function resolveGenericType(
  typeAnnot: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scope: Map<string, any>,
): string | undefined {
  const outerMatch = typeAnnot.match(/^(\w+)<(.*)>$/s);
  if (!outerMatch) return undefined;
  const aliasBody = scope.get("__type__" + outerMatch[1]!);
  if (aliasBody === undefined) return undefined;
  const resolvedType = String(aliasBody).replace(
    /\bT\b/g,
    outerMatch[2]?.trim() ?? "",
  );

  // Recursively resolve if the result still contains generic patterns
  if (/\w+<[^>]*>/.test(resolvedType)) {
    return resolveGenericType(resolvedType, scope);
  }
  return resolvedType;
}

/** Process and store a function definition. */
export function processFnDefinition(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const match = input.match(
    /^\s*fn\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(?:[A-Za-z]\d*|Void))?\s*=>\s*(.+)$/,
  );
  if (!match || !match[1] || typeof match[2] !== "string" || !match[3]) return;
  const extractName = (p: string) => {
    const arrMatch = p.match(/^(\w+)\s*:\s*\[/);
    if (arrMatch) return arrMatch[1];
    const ci = p.indexOf(":");
    return ci >= 0 ? p.substring(0, ci).trim() : p;
  };
  const params = match[2].trim()
    ? match[2].split(",").map((p) => extractName(p.trim()))
    : [];
  if (new Set(params).size !== params.length)
    throw new Error("Duplicate parameter name");
  scope.set("__fn__" + match[1], { body: match[3].trim(), params });
}

/** Maximum number of iterations for while loops to prevent infinite loops. */
const MAX_WHILE_ITERATIONS = 1024;

/** Process a `while (cond) body` statement. */
function processWhileStatement(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const match = input.match(/^\s*while\s*\((.+)\)\s*(.*)$/);
  if (!match || !match[1] || typeof match[2] !== "string") return;
  let iterations = 0;
  while (iterations < MAX_WHILE_ITERATIONS) {
    const condValue = resolveBlocksWithScope(match[1].trim(), scope);
    if (condValue === 0) break;
    processSingleStatement(match[2].trim(), scope);
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
  const rangeMatch = match[1]!.trim().match(/^(\w+)\s+in\s+(.+?)\.\.(.+)$/);
  if (!rangeMatch) return;
  const body = (match[2] ?? "").trim();
  const varName = rangeMatch[1]!.trim();
  const startVal = parseValue(rangeMatch[2]!.trim(), scope);
  const endVal = parseValue(rangeMatch[3]!.trim(), scope);
  if (typeof startVal !== "number" || typeof endVal !== "number") return;
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

/** Process statements in a block. */
export function processBlock(
  scope: Map<string, ScopeValue>,
  parts: string[],
): void {
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (IS_IF.test(part)) {
      const nextPart = parts[i + 1];
      if (nextPart && IS_ELSE.test(nextPart)) {
        processSingleIfElseStatement(part, nextPart.trim(), scope);
        i++;
      } else {
        resolveBlocksWithScope(part, scope);
      }
    } else if (IS_WHILE.test(part)) {
      processWhileStatement(part, scope);
    } else if (IS_FOR.test(part)) {
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
  const match = ifPart.match(/^if\s*\((.+)\)\s*(.*)$/);
  if (!match || !match[1] || typeof match[2] !== "string") return;

  const condValue = resolveBlocksWithScope(match[1], scope);
  const body = match[2].trim();
  if (condValue !== 0) {
    processSingleStatement(body, scope);
  } else {
    processSingleStatement(elsePart.replace(/^\s*else\s+/, "").trim(), scope);
  }
}

/** Process nested block with child scope. */
function processNestedBlock(
  innerParts: string[],
  outerScope: Map<string, ScopeValue>,
): void {
  const hasDeclarations = innerParts.some((p) =>
    /^(?:let|const|var)\s+/.test(p.trim()),
  );
  if (!hasDeclarations) {
    for (const ip of innerParts) processSingleStatement(ip, outerScope);
    return;
  }

  const child = new Map(outerScope);
  MUTABLE_VARS.set(child, getMutableSet(outerScope));
  POINTER_TARGETS.set(child, getPointerTargets(outerScope));
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
  // Recursively replace innermost blocks
  let prev: string;
  do {
    prev = resolved;
    resolved = prev.replace(/\{([^{}]+)\}/g, (_m, bi) => {
      const trimmed = bi.trim();
      if (/^\s*\w+\s*:/.test(trimmed)) return _m;
      if (isStatementBlock(trimmed)) {
        processNestedBlock(splitStatements(trimmed), scope);
        return "";
      }
      return String(evaluateBlockWithScope(trimmed, scope));
    });
  } while (resolved !== prev && /\{/.test(resolved));

  resolved = resolved.trim();
  if (!resolved) return 0; // empty expression returns 0

  const evalScope = new Map(scope as unknown as Map<string, ScopeValue>);
  POINTER_TARGETS.set(evalScope, getPointerTargets(scope));
  NON_ZERO_VARS.set(evalScope, getNonZeroSet(scope));
  return evaluateExpression(
    resolved,
    evalScope as unknown as Map<string, unknown>,
  );
}
