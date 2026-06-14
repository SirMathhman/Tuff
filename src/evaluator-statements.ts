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
  parseObjectLiteral,
} from "./parser-expressions.js";
import { isSafeWiden } from "./type-utils.js";
import { parseDeclaration } from "./parser-declarations.js";
import { replaceInnermostBlocks, looksLikeKeyValue } from "./char-utils.js";
import {
  extractIdentifier,
  isDeclarationStart,
  isMutableDeclaration,
  isBuiltInType,
  hasRefinement as strHasRefinement,
  startsWithNegativeNumber,
  startsWithNumber,
  extractRefinementValues,
  stripPointerPrefix,
  stripRefinement,
  startsWithBracket,
  startsWithParen,
  startsWithAmpersand,
  looksLikeObjectLiteral,
  matchAddressOf,
} from "./string-utils.js";
import {
  isIfStatement,
  isElseKeyword,
  isWhileStatement,
  isForStatement,
  isFnDefinition as strIsFnDefinition,
  isTypeAlias as strIsTypeAlias,
  parseTypeAlias,
  resolveGenericTypeStr,
  parseFnDefinition,
  parseWhileStatement,
  parseForStatement,
  parseAssignment,
  parseRefinementValueType,
} from "./parser-utils.js";

/** Check for statement-only block. */
function isStatementBlock(inner: string): boolean {
  if (isObjectLiteral(inner)) return false;
  const parts = splitStatements(inner);
  if (parts.length === 0) return false;
  for (const p of parts) {
    if (!isAssignment(p.trim()) && !isDeclarationStart(p)) return false;
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
  const lastPart = parts[parts.length - 1];
  if (isAssignment(lastPart!) || isDeclarationStart(lastPart!)) {
    const name = extractIdentifier(lastPart!);
    if (name && scope.has(name)) {
      const val = scope.get(name);
      return typeof val === "number" ? val : 0;
    }
  }
  return resolveBlocksWithScope(lastPart!, scope);
}

/** Check for assignment pattern. */
export function isAssignment(input: string): boolean {
  const trimmed = input.trim();
  const name = extractIdentifier(trimmed);
  if (!name) return false;
  let pos = name.length;
  while (pos < trimmed.length) {
    if (trimmed[pos] === " ") pos++;
    else if (trimmed[pos] === "[") {
      let depth = 1;
      pos++;
      while (pos < trimmed.length && depth > 0) {
        if (trimmed[pos] === "[") depth++;
        else if (trimmed[pos] === "]") depth--;
        pos++;
      }
    } else break;
  }
  while (pos < trimmed.length && trimmed[pos] === " ") pos++;
  if (pos < trimmed.length && (trimmed[pos] === "+" || trimmed[pos] === "-"))
    pos++;
  while (pos < trimmed.length && trimmed[pos] === " ") pos++;
  return pos < trimmed.length && trimmed[pos] === "=";
}

/** Evaluate assignment statement. */
function evaluateAssignment(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const result = parseAssignment(input);
  if (!result) return;
  const {
    name,
    indices,
    isCompound: isCompoundOp,
    op: compoundOp,
    rhs,
  } = result;

  if (indices.length === 0) {
    const mutableSet = getMutableSet(scope);
    if (!mutableSet.has(name))
      throw new Error("Cannot assign to immutable variable: " + name);
    if (!isCompoundOp) {
      scope.set(name, parseValue(rhs, scope));
      return;
    }
    const rhsValue = resolveBlocksWithScope(rhs, scope);
    const cv = scope.get(name);
    const nc = typeof cv === "number" ? cv : 0;
    scope.set(name, compoundOp === "+=" ? nc + rhsValue : nc - rhsValue);
    return;
  }
  const arr = scope.get(name);
  if (!Array.isArray(arr)) throw new Error("Cannot index non-array");
  const evalIndices: number[] = [];
  for (const ie of indices) evalIndices.push(resolveBlocksWithScope(ie, scope));
  let current: unknown[] = arr;
  for (let i = 0; i < evalIndices.length - 1; i++)
    current = current[evalIndices[i]!] as unknown[];
  const fi = evalIndices.at(-1)!;
  if (!isCompoundOp) {
    current[fi] = parseValue(rhs, scope);
    return;
  }
  const rv = resolveBlocksWithScope(rhs, scope);
  const nc = typeof current[fi] === "number" ? current[fi] : 0;
  current[fi] = compoundOp === "+=" ? nc + rv : nc - rv;
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
    const hasRefinement = typeAnnot ? strHasRefinement(typeAnnot) : false;
    const isValueRefinementType = typeAnnot
      ? startsWithNegativeNumber(typeAnnot) || startsWithNumber(typeAnnot)
      : false;
    let baseType = stripPointerPrefix(typeAnnot ?? "");
    if (hasRefinement) baseType = stripRefinement(baseType);
    const typeIsBuiltIn = isBuiltInType(baseType);
    if (typeAnnot && !typeIsBuiltIn) {
      const resolvedGeneric = resolveGenericTypeStr(
        baseType,
        (n) => scope.get("__type__" + n) as string | undefined,
      );
      if (resolvedGeneric !== undefined) {
        baseType = resolvedGeneric;
        typeAnnot = resolvedGeneric;
        getTypeAnnotations(scope).set(name, baseType);
      } else {
        const aliasValue = scope.get("__type__" + typeAnnot);
        if (aliasValue !== undefined) {
          getTypeAnnotations(scope).set(name, "struct");
          typeAnnot = undefined;
        } else getTypeAnnotations(scope).set(name, typeAnnot);
      }
    } else if (typeAnnot) getTypeAnnotations(scope).set(name, baseType);

    const rhs = declResult.rhs;
    let inferredRhsType: string | undefined;
    if (
      !startsWithBracket(rhs) &&
      !isObjectLiteral(rhs) &&
      !rhs.trim().startsWith("{") &&
      !startsWithAmpersand(rhs)
    )
      inferredRhsType = inferExpressionType(
        rhs,
        scope as unknown as Map<string, ScopeValue>,
      );

    let effectiveType = baseType || undefined;
    if (isValueRefinementType && effectiveType) {
      const rr = parseRefinementValueType(effectiveType);
      effectiveType = rr ? rr.type : undefined;
    }
    if (effectiveType) getTypeAnnotations(scope).set(name, effectiveType);
    else if (inferredRhsType)
      getTypeAnnotations(scope).set(name, inferredRhsType);

    if (
      effectiveType &&
      inferredRhsType &&
      !isSafeWiden(inferredRhsType, effectiveType as string)
    )
      throw new Error(
        "Type mismatch: expected " +
          effectiveType +
          " but got " +
          inferredRhsType,
      );

    if (isMutableDeclaration(part)) getMutableSet(scope).add(name);

    let value: unknown;
    const addrOfName = matchAddressOf(rhs);
    if (addrOfName !== null) {
      getPointerTargets(scope).set(name, addrOfName);
      value = scope.get(addrOfName);
      if (value === undefined)
        throw new Error(
          "Cannot take address of undefined variable: " + addrOfName,
        );
    } else if (startsWithBracket(rhs) || startsWithParen(rhs)) {
      value = parseValue(rhs, scope);
    } else if (isObjectLiteral(rhs) || looksLikeObjectLiteral(rhs)) {
      const stripped = rhs.trim();
      const inner =
        stripped.startsWith("{") && stripped.endsWith("}")
          ? stripped.slice(1, -1)
          : stripped;
      value = parseObjectLiteral(tokenize(inner), [0], scope);
    } else value = resolveBlocksWithScope(rhs, scope);

    const excludedValues = extractRefinementValues(typeAnnot ?? "");
    if (excludedValues.includes(0)) getNonZeroSet(scope).add(name);
    if (
      typeof value === "number" &&
      excludedValues.some(function (v) {
        return value === v;
      })
    )
      throw new Error(
        "Refinement type violation: " +
          name +
          " cannot be " +
          excludedValues.find(function (v) {
            return value === v;
          }),
      );

    if (isValueRefinementType && typeof value === "number") {
      const rr = parseRefinementValueType(typeAnnot!);
      if (rr) {
        if (value !== rr.value)
          throw new Error(
            "Refinement type violation: expected " +
              rr.value +
              " but got " +
              value,
          );
        const actualType = getTypeAnnotations(scope).get(name);
        if (!isSafeWiden(actualType ?? "I32", rr.type))
          throw new Error(
            "Refinement type mismatch: expected " +
              rr.type +
              " but got " +
              actualType,
          );
      }
    }
    scope.set(name, value);
  } else if (part.trim().startsWith("{") && part.trim().endsWith("}")) {
    processNestedBlock(splitStatements(part.trim().slice(1, -1)), scope);
  } else if (isAssignment(part)) evaluateAssignment(part, scope);
  else resolveBlocksWithScope(part, scope);
}

/** Check if a statement is a function definition like `fn name() => expr`. */
export function isFnDefinition(input: string): boolean {
  return strIsFnDefinition(input);
}

/** Check if a statement is a type alias like `type Point = { x : I32, y : I32 }` or generic `type Temp<T> = T`. */
export function isTypeAlias(input: string): boolean {
  return strIsTypeAlias(input);
}

/** Process and store a type alias. Supports generics like `type Temp<T> = T`. */
function processTypeAlias(
  input: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scope: Map<string, any>,
): void {
  const result = parseTypeAlias(input);
  if (!result) return;
  scope.set("__type__" + result.name, result.body);
}

/** Process and store a function definition. */
export function processFnDefinition(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const result = parseFnDefinition(input);
  if (!result) return;
  const { name, params, paramTypes, body } = result;

  if (new Set(params).size !== params.length)
    throw new Error("Duplicate parameter name");

  scope.set("__fn__" + name, { body, params, paramTypes });
}

/** Maximum number of iterations for while loops to prevent infinite loops. */
const MAX_WHILE_ITERATIONS = 1024;

/** Process a `while (cond) body` statement. */
function processWhileStatement(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const result = parseWhileStatement(input);
  if (!result) return;
  let iterations = 0;
  while (iterations < MAX_WHILE_ITERATIONS) {
    const condValue = resolveBlocksWithScope(result.cond, scope);
    if (condValue === 0) break;
    processSingleStatement(result.body, scope);
    iterations++;
  }
}

/** Process a `for (var in start..end) body` statement. */
function processForStatement(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const result = parseForStatement(input);
  if (!result) return;
  const { varName, start, end, body } = result;
  const startVal = parseValue(start, scope);
  const endVal = parseValue(end, scope);
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
    if (isIfStatement(part)) {
      const nextPart = parts[i + 1];
      if (nextPart && isElseKeyword(nextPart)) {
        processSingleIfElseStatement(part, nextPart.trim(), scope);
        i++;
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
  const t = ifPart.trim();
  let i = 0;
  while (i < t.length && t[i] !== "(") i++;
  if (i >= t.length) return;
  let depth = 1;
  let j = i + 1;
  while (j < t.length && depth > 0) {
    if (t[j] === "(") depth++;
    else if (t[j] === ")") depth--;
    j++;
  }
  if (depth !== 0) return;
  const cond = t.slice(i + 1, j - 1).trim();
  const body = t.slice(j).trim();
  const condValue = resolveBlocksWithScope(cond, scope);
  if (condValue !== 0) {
    processSingleStatement(body, scope);
    return;
  }
  // Strip "else" keyword from else part
  let eb = elsePart.trim();
  let k = 0;
  while (k < eb.length && (eb[k] === " " || eb[k] === "\t")) k++;
  if (eb.startsWith("else", k)) {
    k += 4;
    while (k < eb.length && (eb[k] === " " || eb[k] === "\t")) k++;
    eb = eb.slice(k);
  }
  processSingleStatement(eb, scope);
}

/** Process nested block with child scope. */
function processNestedBlock(
  innerParts: string[],
  outerScope: Map<string, ScopeValue>,
): void {
  const hasDeclarations = innerParts.some(function (p) {
    return isDeclarationStart(p.trim());
  });
  if (!hasDeclarations) {
    for (const ip of innerParts) processSingleStatement(ip, outerScope);
    return;
  }
  const child = new Map(outerScope);
  MUTABLE_VARS.set(child, getMutableSet(outerScope));
  POINTER_TARGETS.set(child, getPointerTargets(outerScope));
  NON_ZERO_VARS.set(child, getNonZeroSet(outerScope));
  for (const ip of innerParts) processSingleStatement(ip, child);
}

/** Resolve blocks in an expression and evaluate with a given scope. */
export function resolveBlocksWithScope(
  input: string,
  scope: Map<string, ScopeValue>,
): number {
  let resolved = input;
  let prev: string;
  do {
    prev = resolved;
    resolved = replaceInnermostBlocks(resolved, function (trimmed) {
      if (looksLikeKeyValue(trimmed)) return null; // keep as-is
      if (isStatementBlock(trimmed)) {
        processNestedBlock(splitStatements(trimmed), scope);
        return "";
      }
      return String(evaluateBlockWithScope(trimmed, scope));
    });
  } while (resolved !== prev && resolved.indexOf("{") !== -1);

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
