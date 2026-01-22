import { type CompileError } from "./types";
import { parseLetComponents, extractExpressionType } from "./let-binding";

function checkTypeAnnotationCompatibility(
  typeAnnotation: string,
  exprType: string | undefined,
): boolean {
  if (!exprType) return true;
  return exprType === typeAnnotation;
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
    if (
      exprType &&
      !checkTypeAnnotationCompatibility(typeAnnotation, exprType)
    ) {
      return buildTypeError(typeAnnotation, exprType, exprPart);
    }

    remaining = nextRemaining;
  }

  return undefined;
}
