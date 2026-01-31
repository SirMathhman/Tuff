import {
  throwTypeMismatchError,
  getLargestUsedType,
  validateInRange,
  validateVariableTypeCompatibility,
  determineCoercedType,
  TYPE_ORDER,
} from "./types";
import { updateStringState, type StringState } from "./stringState";

type BlockScanState = {
  statements: string[];
  current: string;
  stringState: StringState;
  parenDepth: number;
  braceDepth: number;
  bracketDepth: number;
};

function createBlockScanState(): BlockScanState {
  return {
    statements: [],
    current: "",
    stringState: { inString: null, escaped: false },
    parenDepth: 0,
    braceDepth: 0,
    bracketDepth: 0,
  };
}

function flushBlockStatement(state: BlockScanState): void {
  const trimmed = state.current.trim();
  if (trimmed.length > 0) {
    state.statements.push(trimmed);
  }
  state.current = "";
}

function trackBlockChar(state: BlockScanState, ch: string): void {
  if (updateStringState(ch, state.stringState)) {
    state.current += ch;
    return;
  }

  if (ch === "(") state.parenDepth++;
  if (ch === ")") state.parenDepth = Math.max(state.parenDepth - 1, 0);
  if (ch === "{") state.braceDepth++;
  if (ch === "}") state.braceDepth = Math.max(state.braceDepth - 1, 0);
  if (ch === "[") state.bracketDepth++;
  if (ch === "]") state.bracketDepth = Math.max(state.bracketDepth - 1, 0);

  const isTopLevel =
    state.parenDepth === 0 &&
    state.braceDepth === 0 &&
    state.bracketDepth === 0;
  if (ch === ";" && isTopLevel) {
    flushBlockStatement(state);
    return;
  }

  state.current += ch;
}

function splitBlockStatements(blockContent: string): string[] {
  const state = createBlockScanState();
  for (let i = 0; i < blockContent.length; i++) {
    trackBlockChar(state, blockContent[i]);
  }
  flushBlockStatement(state);
  return state.statements;
}

function parseBlockStatements(blockContent: string): {
  statements: string[];
  variableTypes: Record<string, string>;
  lastStatement: string;
} {
  const statements = splitBlockStatements(blockContent);
  const variableTypes: Record<string, string> = {};

  // Extract variable types from let statements
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (stmt.startsWith("let ")) {
      const match = stmt.match(/let\s+(\w+)\s*:\s*(\w+)\s*=\s*([\s\S]+)/);
      if (match) {
        const [, varName, declType] = match;
        variableTypes[varName] = declType;
      } else {
        const untypedMatch = stmt.match(/let\s+(\w+)\s*=\s*([\s\S]+)/);
        if (untypedMatch) {
          const [, varName] = untypedMatch;
          variableTypes[varName] = "I32";
        }
      }
    }
  }

  const lastStatement =
    statements.length > 0 ? statements[statements.length - 1] : "";

  return { statements, variableTypes, lastStatement };
}

export { parseBlockStatements, splitBlockStatements };

/** Validate type annotations and return used types. */
export function validateAndStripTypeAnnotations(input: string): Set<string> {
  const typesUsed: Set<string> = new Set();

  input.replace(
    /(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g,
    (match: string, value: string, type: string) => {
      const num = parseInt(value, 10);
      validateInRange(num, type);
      typesUsed.add(type);
      return match;
    },
  );

  return typesUsed;
}

/** Validate expression evaluates within type range. */
export function validateExpressionResult(
  expression: string,
  type: string,
): void {
  try {
    const fn = new Function("return " + expression);
    const result = fn();
    validateInRange(result, type);
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.startsWith("Underflow:") ||
        err.message.startsWith("Overflow:"))
    ) {
      throw err;
    }
  }
}

export function inferBlockExpressionType(
  blockContent: string,
): string | undefined {
  const { variableTypes, lastStatement } = parseBlockStatements(blockContent);

  if (!lastStatement) {
    return undefined;
  }

  for (const [varName, type] of Object.entries(variableTypes)) {
    const regex = new RegExp("\\b" + varName + "\\b");
    if (regex.test(lastStatement)) {
      return type;
    }
  }

  return inferTypeFromValue(lastStatement);
}

/** Extract and validate types in an expression against declared type. */
export function extractAndValidateTypesInExpression(
  expression: string,
  declaredType: string,
): void {
  // Skip validation for array types - they are handled separately
  if (declaredType.startsWith("[") && declaredType.endsWith("]")) {
    return;
  }

  const blockMatch = expression.match(/^\s*\{\s*([\s\S]*)\s*\}\s*$/);
  if (blockMatch) {
    const blockContent = blockMatch[1];
    const blockType = inferBlockExpressionType(blockContent);
    if (blockType && TYPE_ORDER[blockType] !== undefined) {
      validateVariableTypeCompatibility(blockType, declaredType);
    }
    return;
  }

  const typesUsed: Set<string> = new Set();
  expression.replace(
    /(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g,
    (match: string, value: string, type: string) => {
      typesUsed.add(type);
      return match;
    },
  );

  if (typesUsed.size === 0) {
    return;
  }

  const maxUsedType = getLargestUsedType(typesUsed);

  if (!maxUsedType) {
    return;
  }

  if (TYPE_ORDER[maxUsedType] > TYPE_ORDER[declaredType]) {
    throwTypeMismatchError(maxUsedType, declaredType);
  }
}

export function inferTypeFromValue(value: string): string | undefined {
  const typesUsed: Set<string> = new Set();

  value.replace(
    /(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g,
    (match: string, _num: string, type: string) => {
      typesUsed.add(type);
      return match;
    },
  );

  if (typesUsed.size === 0) {
    return undefined;
  }

  if (typesUsed.size > 1) {
    return determineCoercedType(Array.from(typesUsed));
  }

  return Array.from(typesUsed)[0];
}

function buildLetStatementResult(
  varName: string,
  declType: string,
  value: string,
  isMutable: boolean,
): {
  varName: string;
  declType: string;
  value: string;
  isMutable: boolean;
} {
  const processedValue = value.trim().replace(/;$/, "");
  return { varName, declType, value: processedValue, isMutable };
}

function tryArrayNoInitMatch(
  statement: string,
): ReturnType<typeof buildLetStatementResult> | null {
  const match = statement.match(
    /let\s+(mut\s+)?(\w+)\s*:\s*(\[[^\]]*;\s*0\s*;[^\]]*\])\s*;?$/,
  );
  if (!match) return null;
  const [, varMut, varName, arrayType] = match;
  return buildLetStatementResult(
    varName,
    arrayType,
    "[]",
    varMut !== undefined,
  );
}

function tryArrayWithInitMatch(
  statement: string,
): ReturnType<typeof buildLetStatementResult> | null {
  const match = statement.match(
    /let\s+(mut\s+)?(\w+)\s*:\s*(\[[^\]]+\])\s*=\s*([\s\S]+)/,
  );
  if (!match) return null;
  const [, varMut, varName, arrayType, value] = match;
  return buildLetStatementResult(
    varName,
    arrayType,
    value,
    varMut !== undefined,
  );
}

function tryTypedMatch(
  statement: string,
): ReturnType<typeof buildLetStatementResult> | null {
  const match = statement.match(
    /let\s+(mut\s+)?(\w+)\s*:\s*(\*?)(mut\s+)?(\w+)\s*=\s*([\s\S]+)/,
  );
  if (!match) return null;
  const [, varMut, varName, pointerPrefix, typeMut, baseType, value] = match;
  const declType = pointerPrefix + (typeMut ? "mut " : "") + baseType;
  return buildLetStatementResult(
    varName,
    declType,
    value,
    varMut !== undefined,
  );
}

function tryInferredMatch(
  statement: string,
): ReturnType<typeof buildLetStatementResult> | null {
  const match = statement.match(/let\s+(mut\s+)?(\w+)\s*=\s*([\s\S]+)/);
  if (!match) return null;
  const [, mutKeyword, varName, value] = match;
  const inferredType = inferTypeFromValue(value);
  const declType = inferredType ?? "I32";
  return buildLetStatementResult(
    varName,
    declType,
    value,
    mutKeyword !== undefined,
  );
}

export function parseLetStatement(statement: string): {
  varName: string;
  declType: string;
  value: string;
  isMutable: boolean;
} | null {
  const arrayNoInit = tryArrayNoInitMatch(statement);
  if (arrayNoInit) return arrayNoInit;

  const arrayWithInit = tryArrayWithInitMatch(statement);
  if (arrayWithInit) return arrayWithInit;

  const typed = tryTypedMatch(statement);
  if (typed) return typed;

  const inferred = tryInferredMatch(statement);
  if (inferred) return inferred;

  return null;
}

export function determineAndValidateType(
  trimmed: string,
  typesUsed: Set<string>,
): void {
  let resultType: string | undefined;

  if (typesUsed.size > 1) {
    const types = Array.from(typesUsed);
    resultType = determineCoercedType(types);

    if (!resultType) {
      const sorted = types.sort();
      throw new Error(
        "Type mismatch: cannot mix " +
          sorted[0] +
          " and " +
          sorted[1] +
          " in arithmetic expression",
      );
    }
  } else if (typesUsed.size === 1) {
    resultType = Array.from(typesUsed)[0];
  }

  if (resultType && resultType !== "F32" && resultType !== "F64") {
    validateExpressionResult(trimmed, resultType);
  }
}
