import { type CompileError } from "./types";
import {
  type VariableContext,
  parseLetComponents,
  buildContextFromLetBindings,
} from "./let-binding";
import {
  isIdentifierChar,
} from "./parser";

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

function findMutableReferencesInString(text: string): string[] {
  const references: string[] = [];
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] !== "&" || text[i + 1] !== "m") continue;
    if (text.substring(i, i + 4) !== "&mut") continue;

    // Skip whitespace after &mut
    let j = i + 4;
    while (j < text.length && (text[j] === " " || text[j] === "\t")) {
      j++;
    }

    const varName = extractVariableName(text, j);
    if (varName.length > 0) {
      references.push(varName);
    }
  }
  return references;
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
  // Check mutable reference constraints first
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

    current = comp.remaining;
  }

  const variableTypes = buildVariableTypesFromLetBindings(source);
  return checkRemainingExpressionForDereference(current, variableTypes);
}
