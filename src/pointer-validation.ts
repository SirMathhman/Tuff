import { type CompileError } from "./types";
import { type VariableContext } from "./variable-types";
import {
  parseLetComponents,
  buildContextFromLetBindings,
} from "./let-binding";
import { isIdentifierChar } from "./parser";

function validateDereferenceIsPointer(
  varName: string,
  variableTypes: VariableContext,
  remaining: string,
): CompileError | undefined {
  const binding = variableTypes.find((b) => b.name === varName);
  if (binding && binding.type && !binding.type.startsWith("*")) {
    return {
      cause: `Cannot dereference non-pointer type ${binding.type}`,
      reason: `Variable '${varName}' has type ${binding.type}, which is not a pointer type`,
      fix: `Use a pointer type or remove the dereference operator`,
      first: { line: 0, column: 0, length: remaining.length },
    };
  }
  return undefined;
}

function checkRemainingExpressionForDereference(
  remaining: string,
  variableTypes: VariableContext,
): CompileError | undefined {
  if (remaining.length === 0) return undefined;
  if (!remaining.startsWith("*") || remaining.length === 1) return undefined;

  const secondChar = remaining[1];
  if (!secondChar || !isIdentifierChar(secondChar, true)) return undefined;

  // Extract the variable name
  let varName = "";
  let i = 1;
  while (i < remaining.length) {
    const char = remaining[i];
    if (!char || !isIdentifierChar(char, false)) break;
    varName += char;
    i++;
  }

  return validateDereferenceIsPointer(varName, variableTypes, remaining);
}

function buildVariableTypesFromLetBindings(source: string): VariableContext {
  return buildContextFromLetBindings(source);
}

function skipToTypeAnnotation(afterLet: string): number {
  let i = 0;
  if (afterLet.startsWith("mut")) {
    i = 3;
  }
  // Skip variable name
  while (i < afterLet.length) {
    const char = afterLet[i];
    if (!char || !isIdentifierChar(char, i === 0)) break;
    i++;
  }
  // Skip whitespace
  while (i < afterLet.length) {
    const char = afterLet[i];
    if (char && char !== " " && char !== "\t") break;
    i++;
  }
  return i;
}

function skipWhitespaceAt(text: string, pos: number): number {
  let i = pos;
  while (i < text.length) {
    const char = text[i];
    if (char && char !== " " && char !== "\t") break;
    i++;
  }
  return i;
}

function checkPointerTypeWithoutInit(source: string): CompileError | undefined {
  const current = source.trim();
  if (!current.startsWith("let")) return undefined;

  const afterLet = current.substring(3).trim();
  let i = skipToTypeAnnotation(afterLet);

  // Check for ':'
  if (i >= afterLet.length || afterLet[i] !== ":") return undefined;

  i++;
  i = skipWhitespaceAt(afterLet, i);

  // Check if the type annotation starts with '*'
  if (i < afterLet.length && afterLet[i] === "*") {
    return {
      cause: "Pointer types must be initialized",
      reason:
        "Pointer variables require an expression like &x to create a reference",
      fix: "Add an initialization expression, e.g., 'let y : *I32 = &x;'",
      first: { line: 0, column: 0, length: afterLet.length },
    };
  }
  return undefined;
}

function isVariableMutableInContext(
  varName: string,
  context: VariableContext,
): boolean {
  for (let i = 0; i < context.length; i++) {
    const binding = context[i];
    if (binding && binding.name === varName && binding.mutable) {
      return true;
    }
  }
  return false;
}

function extractVariableName(text: string, startPos: number): string {
  let varName = "";
  let j = startPos;
  while (j < text.length) {
    const char = text[j];
    if (!char || !isIdentifierChar(char, varName.length === 0)) break;
    varName += char;
    j++;
  }
  return varName;
}

function skipWhitespaceFrom(text: string, startPos: number): number {
  let j = startPos;
  while (j < text.length && (text[j] === " " || text[j] === "\t")) {
    j++;
  }
  return j;
}

function extractAndAppendReference(
  references: string[],
  text: string,
  startPos: number,
): void {
  const varName = extractVariableName(text, startPos);
  if (varName.length > 0) {
    references.push(varName);
  }
}

function extractReferencesWithPattern(text: string, pattern: string): string[] {
  const references: string[] = [];
  const patternLen = pattern.length;

  for (let i = 0; i <= text.length - patternLen; i++) {
    if (text.substring(i, i + patternLen) !== pattern) continue;
    const j = skipWhitespaceFrom(text, i + patternLen);
    extractAndAppendReference(references, text, j);
  }
  return references;
}

function findMutableReferencesInString(text: string): string[] {
  return extractReferencesWithPattern(text, "&mut");
}

function findImmutableReferencesInString(text: string): string[] {
  const references: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "&") continue;
    // Skip &mut patterns
    if (text.substring(i, i + 4) === "&mut") continue;

    const j = skipWhitespaceFrom(text, i + 1);
    extractAndAppendReference(references, text, j);
  }
  return references;
}

function checkMutableReferencesConflict(
  source: string,
): CompileError | undefined {
  const mutRefs = findMutableReferencesInString(source);
  const immutRefs = findImmutableReferencesInString(source);

  // Check if any variable has both mutable and immutable references
  for (const mutVar of mutRefs) {
    if (immutRefs.includes(mutVar)) {
      return {
        cause: `Cannot mix mutable and immutable references to '${mutVar}'`,
        reason:
          "A variable cannot have both mutable (&mut) and immutable (&) references in the same scope",
        fix: "Use either all mutable or all immutable references to a variable",
        first: { line: 0, column: 0, length: source.length },
      };
    }
  }

  return undefined;
}

function checkMultipleMutableReferences(
  source: string,
): CompileError | undefined {
  const mutRefs = findMutableReferencesInString(source);
  const seenVars = new Set<string>();

  for (const varName of mutRefs) {
    if (seenVars.has(varName)) {
      return {
        cause: `Cannot create multiple mutable references to '${varName}'`,
        reason:
          "A variable can only have one mutable reference (exclusive borrow) at a time",
        fix: "Use only one mutable reference or convert to immutable references",
        first: { line: 0, column: 0, length: source.length },
      };
    }
    seenVars.add(varName);
  }

  return undefined;
}

function checkMutableReferenceConstraints(
  source: string,
): CompileError | undefined {
  const context = buildContextFromLetBindings(source);
  const mutRefVarNames = findMutableReferencesInString(source);

  for (const varName of mutRefVarNames) {
    if (!isVariableMutableInContext(varName, context)) {
      return {
        cause: `Cannot create mutable reference to non-mutable variable '${varName}'`,
        reason:
          "Mutable references (&mut) can only be created for variables declared with 'let mut'",
        fix: "Declare the variable as mutable using 'let mut', or use '&' for an immutable reference",
        first: { line: 0, column: 0, length: source.length },
      };
    }
  }

  return undefined;
}

export function detectPointerTypeErrors(
  source: string,
): CompileError | undefined {
  // Check for mixed mutable and immutable references first
  const mixedRefError = checkMutableReferencesConflict(source);
  if (mixedRefError) return mixedRefError;

  // Check for multiple mutable references to same variable
  const multiMutError = checkMultipleMutableReferences(source);
  if (multiMutError) return multiMutError;

  // Check mutable reference constraints
  const mutRefError = checkMutableReferenceConstraints(source);
  if (mutRefError) return mutRefError;

  let current = source;
  while (current.length > 0) {
    current = current.trim();
    if (!current.startsWith("let")) break;

    const comp = parseLetComponents(current);
    if (!comp) {
      return checkPointerTypeWithoutInit(current);
    }

    // Check for pointer type without initialization (declaration-only pointer)
    if (comp.exprPart === "" && comp.typeAnnotation?.startsWith("*")) {
      return {
        cause: "Pointer types must be initialized",
        reason:
          "Pointer variables require an expression like &x to create a reference",
        fix: "Add an initialization expression, e.g., 'let y : *I32 = &x;'",
        first: { line: 0, column: 0, length: current.length },
      };
    }

    current = comp.remaining;
  }

  const variableTypes = buildVariableTypesFromLetBindings(source);
  return checkRemainingExpressionForDereference(current, variableTypes);
}
