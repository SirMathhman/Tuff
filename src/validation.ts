import { type CompileError, getTypeBits, isSignedType } from "./types";
import { parseLetComponents, extractExpressionType } from "./let-binding";

function isTypeCompatible(declaredType: string, exprType: string): boolean {
  if (declaredType === exprType) return true;

  const declaredBits = getTypeBits(declaredType);
  const exprBits = getTypeBits(exprType);

  if (declaredBits === undefined || exprBits === undefined) return false;

  const declaredSigned = isSignedType(declaredType);
  const exprSigned = isSignedType(exprType);

  // Allow widening: expr type can fit in declared type
  // For unsigned: U8 (8 bits) -> U16 (16 bits), U8 -> I16 (16 bits, signed)
  // For signed: I8 (8 bits) -> I16 (16 bits)
  // For mixed: U8 (8 bits) -> I16 (16 bits - room for sign and value)

  // If expr is unsigned and declared is unsigned, allow if expr bits <= declared bits
  if (!exprSigned && !declaredSigned) {
    return exprBits <= declaredBits;
  }

  // If expr is signed and declared is signed, allow if expr bits <= declared bits
  if (exprSigned && declaredSigned) {
    return exprBits <= declaredBits;
  }

  // If expr is unsigned and declared is signed, allow if expr fits in signed range
  // U8 (0-255) fits in I16 (-32768 to 32767) but not I8 (-128 to 127)
  if (!exprSigned && declaredSigned) {
    return exprBits < declaredBits;
  }

  // If expr is signed and declared is unsigned, disallow (can't fit negative)
  return false;
}

function buildTypeError(
  typeAnnotation: string,
  exprType: string,
  exprPart: string,
): CompileError {
  return {
    cause: `Type mismatch: expected ${typeAnnotation} but got ${exprType}`,
    reason: `The expression type ${exprType} does not match the declared type ${typeAnnotation}`,
    fix: "Change the type annotation or the expression to match",
    first: { line: 0, column: 0, length: exprPart.length },
  };
}

export function detectVariableShadowing(
  source: string,
): CompileError | undefined {
  const variables = new Set<string>();
  let remaining = source;

  while (remaining.startsWith("let")) {
    const components = parseLetComponents(remaining);
    if (!components) break;

    const { varName, remaining: nextRemaining } = components;

    if (variables.has(varName)) {
      return {
        cause: `Variable '${varName}' is shadowed`,
        reason: "A variable with this name was already declared in this scope",
        fix: "Use a different variable name",
        first: { line: 0, column: 0, length: varName.length },
      };
    }

    variables.add(varName);
    remaining = nextRemaining;
  }

  return undefined;
}

export function detectTypeIncompatibility(
  source: string,
): CompileError | undefined {
  let remaining = source;

  while (remaining.startsWith("let")) {
    const components = parseLetComponents(remaining);
    if (!components) break;

    const { typeAnnotation, exprPart, remaining: nextRemaining } = components;

    if (!typeAnnotation) {
      remaining = nextRemaining;
      continue;
    }

    const exprType = extractExpressionType(exprPart);
    if (exprType && !isTypeCompatible(typeAnnotation, exprType)) {
      return buildTypeError(typeAnnotation, exprType, exprPart);
    }

    remaining = nextRemaining;
  }

  return undefined;
}
