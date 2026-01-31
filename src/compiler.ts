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

function processLetStatements(
  statements: string[],
  handler: (_stmt: string, _idx: number) => void,
): Record<string, string> {
  const variableTypes: Record<string, string> = {};
  for (let i = 0; i < statements.length - 1; i++) {
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
      handler(stmt, i);
    }
  }
  return variableTypes;
}

function extractVariableTypes(statements: string[]): Record<string, string> {
  return processLetStatements(statements, () => {
    // No-op handler for just extracting types
  });
}

function parseBlockStatements(blockContent: string): {
  statements: string[];
  variableTypes: Record<string, string>;
  lastStatement: string;
} {
  const statements = splitBlockStatements(blockContent);
  const variableTypes = extractVariableTypes(statements);
  const lastStatement =
    statements.length > 0 ? statements[statements.length - 1] : "";

  return { statements, variableTypes, lastStatement };
}

export { parseBlockStatements, splitBlockStatements, processLetStatements };

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

export function parseLetStatement(
  statement: string,
): { varName: string; declType: string; value: string } | null {
  let letMatch = statement.match(/let\s+(\w+)\s*:\s*(\*?)(\w+)\s*=\s*([\s\S]+)/);
  if (letMatch) {
    const [, varName, pointerPrefix, baseType, value] = letMatch;
    const declType = pointerPrefix + baseType;
    const processedValue = value.trim().replace(/;$/, "");
    
    return { varName, declType, value: processedValue };
  }

  letMatch = statement.match(/let\s+(\w+)\s*=\s*([\s\S]+)/);
  if (letMatch) {
    const [, varName, value] = letMatch;
    const trimmedValue = value.trim().replace(/;$/, "");

    const inferredType = inferTypeFromValue(trimmedValue);
    const declType = inferredType ?? "I32";

    return { varName, declType, value: trimmedValue };
  }

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
