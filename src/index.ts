type Result<T, E> = { success: true; data: T } | { success: false; error: E };

type Variable = { name: string; type: string; value: number | bigint; mutable: boolean };

type VariableScope = {
  variables: Map<string, Variable>;
  parent: VariableScope | null;
};

type Range = { min: number | bigint; max: number | bigint; unsigned: boolean };

const TYPE_RANGES: Record<string, Range> = {
  U8: { min: 0, max: 255, unsigned: true },
  U16: { min: 0, max: 65535, unsigned: true },
  U32: { min: 0, max: 4294967295, unsigned: true },
  U64: { min: 0n, max: 18446744073709551615n, unsigned: true },
  I8: { min: -128, max: 127, unsigned: false },
  I16: { min: -32768, max: 32767, unsigned: false },
  I32: { min: -2147483648, max: 2147483647, unsigned: false },
  I64: { min: -9223372036854775808n, max: 9223372036854775807n, unsigned: false },
};

const TYPE_ORDER: string[] = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];

function createScope(parent: VariableScope | null = null): VariableScope {
  return { variables: new Map(), parent };
}

function canCoerceType(sourceType: string, targetType: string): boolean {
  if (sourceType === targetType) {
    return true;
  }

  const sourceIndex = TYPE_ORDER.indexOf(sourceType);
  const targetIndex = TYPE_ORDER.indexOf(targetType);

  if (sourceIndex === -1 || targetIndex === -1) {
    return false;
  }

  const sourceRange = TYPE_RANGES[sourceType];
  const targetRange = TYPE_RANGES[targetType];

  if (sourceRange.unsigned !== targetRange.unsigned) {
    return false;
  }

  return targetIndex > sourceIndex;
}

function declareVariable(scope: VariableScope, name: string, type: string, value: number | bigint, mutable: boolean = false): Result<void, string> {
  if (scope.variables.has(name)) {
    return { success: false, error: "Variable " + name + " already declared in this scope" };
  }

  const range = TYPE_RANGES[type];
  if (!range) {
    return { success: false, error: "Unknown type: " + type };
  }

  const validateResult = validateNumber(value, range, type);
  if (!validateResult.success) {
    return validateResult as unknown as Result<void, string>;
  }

  scope.variables.set(name, { name, type, value, mutable });
  return { success: true, data: undefined };
}

function assignVariableWithType(scope: VariableScope, name: string, newValue: number | bigint, valueType: string | null): Result<void, string> {
  const lookupResult = lookupVariable(scope, name);
  if (!lookupResult.success) {
    return lookupResult as Result<void, string>;
  }

  const variable = (lookupResult as { success: true; data: Variable }).data;
  if (!variable.mutable) {
    return { success: false, error: "Cannot assign to immutable variable: " + name };
  }

  if (valueType !== null && !canCoerceType(valueType, variable.type)) {
    return { success: false, error: "Cannot coerce type " + valueType + " to " + variable.type };
  }

  const range = TYPE_RANGES[variable.type];
  const validateResult = validateNumber(newValue, range, variable.type);
  if (!validateResult.success) {
    return validateResult as unknown as Result<void, string>;
  }

  variable.value = newValue;
  return { success: true, data: undefined };
}

function lookupVariable(scope: VariableScope, name: string): Result<Variable, string> {
  let current: VariableScope | null = scope;

  while (current !== null) {
    if (current.variables.has(name)) {
      return { success: true, data: current.variables.get(name) as Variable };
    }
    current = current.parent;
  }

  return { success: false, error: "Undefined variable: " + name };
}

function isInRange(value: number | bigint, range: Range): boolean {
  return value >= range.min && value <= range.max;
}

function getWiderType(leftType: string, rightType: string): string | null {
  if (leftType === rightType) {
    return leftType;
  }
  const leftIndex = TYPE_ORDER.indexOf(leftType);
  const rightIndex = TYPE_ORDER.indexOf(rightType);
  if (leftIndex === -1 || rightIndex === -1) {
    return null;
  }
  return leftIndex > rightIndex ? leftType : rightType;
}

function getRangeExceededError(typeName: string, prefix: string = "Number"): string {
  const rangeInfo = TYPE_RANGES[typeName];
  return prefix + " exceeds " + typeName + " range (" + rangeInfo.min + "-" + rangeInfo.max + ")";
}

function validateNumber(value: number | bigint, range: Range, typeName: string): Result<number | bigint, string> {
  if (range.unsigned && (typeof value === "number" ? value < 0 : value < 0n)) {
    return { success: false, error: "Negative numbers cannot have " + typeName + " suffix" };
  }

  if (!isInRange(value, range)) {
    return { success: false, error: getRangeExceededError(typeName) };
  }

  return { success: true, data: value };
}

function checkOperationRange(result: number | bigint, typeName: string, operation: string = "Operation"): Result<number | bigint, string> {
  if (!isInRange(result, TYPE_RANGES[typeName])) {
    return { success: false, error: getRangeExceededError(typeName, operation) };
  }
  return { success: true, data: result };
}

function getCommonTypeForOperation(leftType: string | null, rightType: string | null, operation: string): { commonType: string | null; error: string | null } {
  if (leftType === null && rightType === null) {
    return { commonType: null, error: null };
  }

  if (leftType === null || rightType === null) {
    return { commonType: null, error: "Cannot " + operation + " typed and untyped numbers together" };
  }

  const commonType = getWiderType(leftType, rightType);
  if (commonType === null) {
    return { commonType: null, error: "Cannot " + operation + " different types together" };
  }

  return { commonType, error: null };
}

function performUntypedOperation(left: number | bigint, right: number | bigint, operation: string): number | bigint | null {
  const left_num = left as number;
  const right_num = right as number;
  if (operation === "add") {
    return left_num + right_num;
  } else if (operation === "subtract") {
    return left_num - right_num;
  } else if (operation === "multiply") {
    return left_num * right_num;
  } else if (operation === "divide") {
    if (right_num === 0) {
      return null;
    }
    return left_num / right_num;
  }
  return 0;
}

function resolveCommonType(leftType: string | null, rightType: string | null, operation: string): { commonType: string | null; errorResult: Result<number | bigint, string> | null } {
  const typeCheck = getCommonTypeForOperation(leftType, rightType, operation);
  if (typeCheck.error) {
    return { commonType: null, errorResult: { success: false, error: typeCheck.error } };
  }

  const commonType = typeCheck.commonType;
  if (commonType === null) {
    return { commonType: null, errorResult: { success: false, error: "Invalid type" } };
  }

  return { commonType, errorResult: null };
}

function addNumbers(left: number | bigint, right: number | bigint, typeName: string): Result<number | bigint, string> {
  if ((typeof left === "bigint") !== (typeof right === "bigint")) {
    return { success: false, error: "Cannot add number and bigint together" };
  }

  const sum = (typeof left === "bigint")
    ? (left as bigint) + (right as bigint)
    : (left as number) + (right as number);

  return checkOperationRange(sum, typeName, "Addition");
}

function performOperation(left: number | bigint, right: number | bigint, leftPart: string, rightPart: string, operation: string): Result<number | bigint, string> {
  const leftType = getTypeForValue(leftPart.trim());
  const rightType = getTypeForValue(rightPart.trim());

  if (leftType === null && rightType === null) {
    const untypedResult = performUntypedOperation(left, right, operation);
    if (untypedResult === null) {
      return { success: false, error: "Cannot divide by zero" };
    }
    return { success: true, data: untypedResult };
  }

  const typeResolve = resolveCommonType(leftType, rightType, operation);
  if (typeResolve.errorResult) {
    return typeResolve.errorResult;
  }

  const commonType = typeResolve.commonType as string;

  if (operation === "add") {
    return addNumbers(left, right, commonType);
  }

  if ((typeof left === "bigint") !== (typeof right === "bigint")) {
    return { success: false, error: "Cannot perform " + operation + " on number and bigint together" };
  }

  if (operation === "divide") {
    if ((typeof right === "bigint" ? right === 0n : right === 0)) {
      return { success: false, error: "Cannot divide by zero" };
    }
  }

  let result_value: number | bigint;
  if (operation === "subtract") {
    result_value = (typeof left === "bigint")
      ? (left as bigint) - (right as bigint)
      : (left as number) - (right as number);
  } else if (operation === "multiply") {
    result_value = (typeof left === "bigint")
      ? (left as bigint) * (right as bigint)
      : (left as number) * (right as number);
  } else if (operation === "divide") {
    result_value = (typeof left === "bigint")
      ? (left as bigint) / (right as bigint)
      : (left as number) / (right as number);
  } else {
    return { success: false, error: "Unknown operation: " + operation };
  }

  return checkOperationRange(result_value, commonType, operation);
}

function parseStatementBlock(input: string): Result<{ statements: string[]; finalExpr: string }, string> {
  const trimmed = input.trim();
  const parts: string[] = [];
  let current = "";
  let braceDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (char === "{") {
      braceDepth++;
      current += char;
    } else if (char === "}") {
      braceDepth--;
      current += char;
    } else if (char === "(") {
      parenDepth++;
      current += char;
    } else if (char === ")") {
      parenDepth--;
      current += char;
    } else if (char === ";" && braceDepth === 0 && parenDepth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  if (parts.length < 2) {
    return { success: false, error: "Statement block must contain at least one statement and an expression" };
  }

  const statements = parts.slice(0, -1);
  const finalExpr = parts[parts.length - 1];

  if (finalExpr === "") {
    return { success: false, error: "Statement block must end with an expression" };
  }

  return { success: true, data: { statements, finalExpr } };
}

function interpretStatementBlock(input: string, parentScope: VariableScope | null = null): Result<number | bigint, string> {
  const parseResult = parseStatementBlock(input);
  if (!parseResult.success) {
    return parseResult;
  }

  const { statements, finalExpr } = (parseResult as { success: true; data: { statements: string[]; finalExpr: string } }).data;
  const blockScope = createScope(parentScope);

  for (const stmt of statements) {
    if (stmt.startsWith("let ")) {
      const declResult = parseVariableDeclaration(stmt, blockScope);
      if (!declResult.success) {
        return declResult;
      }
    } else {
      const assignIndex = stmt.indexOf("=");
      if (assignIndex !== -1) {
        const lhs = stmt.slice(0, assignIndex).trim();
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(lhs)) {
          const rhs = stmt.slice(assignIndex + 1).trim();
          const valueResult = interpretWithVariables(rhs, blockScope);
          if (!valueResult.success) {
            return valueResult;
          }
          const newValue = (valueResult as { success: true; data: number | bigint }).data;
          let rhsType: string | null = null;
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rhs)) {
            const rhsVarLookup = lookupVariable(blockScope, rhs);
            if (rhsVarLookup.success) {
              rhsType = (rhsVarLookup as { success: true; data: Variable }).data.type;
            }
          } else {
            rhsType = getTypeForValue(rhs);
          }
          const assignResult = assignVariableWithType(blockScope, lhs, newValue, rhsType);
          if (!assignResult.success) {
            return assignResult;
          }
          continue;
        }
      }
      const exprResult = interpretWithVariables(stmt, blockScope);
      if (!exprResult.success) {
        return exprResult;
      }
    }
  }

  return interpretWithVariables(finalExpr, blockScope);
}

function inferAndValidateType(valueStr: string, targetType: string | null, value: number | bigint, scope: VariableScope | null): Result<string, string> {
  let sourceType: string | null = null;

  if (scope !== null && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(valueStr)) {
    const lookupResult = lookupVariable(scope, valueStr);
    if (lookupResult.success) {
      sourceType = (lookupResult as { success: true; data: Variable }).data.type;
    }
  } else {
    sourceType = getTypeForValue(valueStr);
  }

  if (targetType === null) {
    if (sourceType === null) {
      if (typeof value === "bigint") {
        sourceType = "I64";
      } else if (value >= 0 && value <= 255) {
        sourceType = "U8";
      } else if (value >= -128 && value <= 127) {
        sourceType = "I8";
      } else if (value >= 0 && value <= 65535) {
        sourceType = "U16";
      } else if (value >= -32768 && value <= 32767) {
        sourceType = "I16";
      } else if (value >= 0 && value <= 4294967295) {
        sourceType = "U32";
      } else {
        sourceType = "I32";
      }
    }
    return { success: true, data: sourceType };
  }

  if (sourceType !== null && !canCoerceType(sourceType, targetType)) {
    return { success: false, error: "Cannot coerce type " + sourceType + " to " + targetType };
  }

  return { success: true, data: targetType };
}

function parseVariableDeclaration(stmt: string, scope: VariableScope): Result<void, string> {
  const trimmed = stmt.trim();

  if (!trimmed.startsWith("let ")) {
    return { success: false, error: "Expected 'let' keyword" };
  }

  let rest = trimmed.slice(4).trim();
  let mutable = false;

  if (rest.startsWith("mut ")) {
    mutable = true;
    rest = rest.slice(4).trim();
  }

  const colonIndex = rest.indexOf(":");
  const equalsIndex = rest.indexOf("=");

  if (equalsIndex === -1) {
    return { success: false, error: "Expected '=' in variable declaration" };
  }

  let varName: string;
  let targetType: string | null;
  let valueStr: string;

  if (colonIndex === -1) {
    varName = rest.slice(0, equalsIndex).trim();
    targetType = null;
    valueStr = rest.slice(equalsIndex + 1).trim();
  } else if (colonIndex < equalsIndex) {
    varName = rest.slice(0, colonIndex).trim();
    const afterColon = rest.slice(colonIndex + 1).trim();
    const equalsInAfterColon = afterColon.indexOf("=");
    targetType = afterColon.slice(0, equalsInAfterColon).trim();
    valueStr = afterColon.slice(equalsInAfterColon + 1).trim();
  } else {
    return { success: false, error: "Invalid variable declaration format" };
  }

  if (!varName || !valueStr) {
    return { success: false, error: "Invalid variable declaration format" };
  }

  const valueResult = interpret(valueStr, scope);
  if (!valueResult.success) {
    return valueResult;
  }

  const value = (valueResult as { success: true; data: number | bigint }).data;
  const typeResult = inferAndValidateType(valueStr, targetType, value, scope);

  if (!typeResult.success) {
    return typeResult;
  }

  const finalType = (typeResult as { success: true; data: string }).data;
  return declareVariable(scope, varName, finalType, value, mutable);
}

function interpretWithVariables(input: string, scope: VariableScope): Result<number | bigint, string> {
  const trimmed = input.trim();

  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    const lookupResult = lookupVariable(scope, trimmed);
    if (lookupResult.success) {
      return { success: true, data: (lookupResult as { success: true; data: Variable }).data.value };
    } else {
      return lookupResult;
    }
  }

  return interpret(trimmed, scope);
}

function evaluateGroupedExpressions(input: string, scope: VariableScope | null = null): string {
  let result = input;
  let changed = true;

  while (changed) {
    changed = false;
    let depth = 0;
    let start = -1;
    let groupChar = "";

    for (let i = 0; i < result.length; i++) {
      const char = result[i];
      const isOpenBrace = char === "(" || char === "{";
      const isCloseBrace = (char === ")" && groupChar === "(") || (char === "}" && groupChar === "{");

      if (isOpenBrace) {
        if (depth === 0) {
          start = i;
          groupChar = char;
        }
        depth++;
      } else if (isCloseBrace) {
        depth--;
        if (depth === 0 && start !== -1) {
          const inner = result.substring(start + 1, i);
          let innerResult: Result<number | bigint, string>;

          if (groupChar === "{" && inner.includes("let ")) {
            innerResult = interpretStatementBlock(inner, scope);
          } else {
            innerResult = interpret(inner, scope);
          }

          if (!innerResult.success) {
            return "";
          }

          const evaluated = String((innerResult as { success: true; data: number | bigint }).data);
          result = result.substring(0, start) + evaluated + result.substring(i + 1);
          changed = true;
          break;
        }
      }
    }
  }

  return result;
}

function evaluateParenthesizedExpressions(input: string, scope: VariableScope | null = null): string {
  return evaluateGroupedExpressions(input, scope);
}

function tokenizeExpression(input: string): Array<{ type: "operand" | "operator"; value: string }> {
  const tokens: Array<{ type: "operand" | "operator"; value: string }> = [];
  let current = "";
  let i = 0;

  while (i < input.length) {
    if (i < input.length - 1 && input[i] === " " && (input[i + 1] === "+" || input[i + 1] === "-" || input[i + 1] === "*" || input[i + 1] === "/") && input[i + 2] === " ") {
      if (current.trim()) {
        tokens.push({ type: "operand", value: current.trim() });
        current = "";
      }
      tokens.push({ type: "operator", value: input[i + 1] });
      i += 3;
    } else {
      current += input[i];
      i += 1;
    }
  }

  if (current.trim()) {
    tokens.push({ type: "operand", value: current.trim() });
  }

  return tokens;
}

function parseAndApplyOperation(tokens: Array<{ type: "operand" | "operator"; value: string }>, leftData: number | bigint, operatorIndex: number, opName: string, scope: VariableScope | null = null): Result<number | bigint, string> {
  if (operatorIndex + 1 >= tokens.length || tokens[operatorIndex + 1].type !== "operand") {
    return { success: false, error: "Invalid expression" };
  }

  const rightResult = interpret(tokens[operatorIndex + 1].value, scope);
  if (!rightResult.success) {
    return rightResult;
  }

  const rightData: number | bigint = (rightResult as { success: true; data: number | bigint }).data;
  return performOperation(leftData, rightData, tokens[operatorIndex - 1].value, tokens[operatorIndex + 1].value, opName);
}

function shouldStopOperatorParsing(operator: string, allowedOps: string[]): boolean {
  return !allowedOps.includes(operator);
}

function interpretMultiplyDivide(tokens: Array<{ type: "operand" | "operator"; value: string }>, startIndex: number, scope: VariableScope | null = null): Result<{ value: number | bigint; nextIndex: number }, string> {
  let result = interpret(tokens[startIndex].value, scope);

  if (!result.success) {
    return result as unknown as Result<{ value: number | bigint; nextIndex: number }, string>;
  }

  let i = startIndex + 1;
  while (i < tokens.length) {
    if (tokens[i].type !== "operator") {
      return { success: false, error: "Invalid expression" };
    }

    const operator = tokens[i].value;
    if (shouldStopOperatorParsing(operator, ["*", "/"])) {
      return { success: true, data: { value: (result as { success: true; data: number | bigint }).data, nextIndex: i } };
    }

    const opName = operator === "*" ? "multiply" : "divide";
    const resultData: number | bigint = (result as { success: true; data: number | bigint }).data;
    const opResult: Result<number | bigint, string> = parseAndApplyOperation(tokens, resultData, i, opName, scope);

    if (!opResult.success) {
      return opResult as unknown as Result<{ value: number | bigint; nextIndex: number }, string>;
    }

    result = opResult;
    tokens[i + 1].value = String((result as { success: true; data: number | bigint }).data);
    i += 2;
  }

  return { success: true, data: { value: (result as { success: true; data: number | bigint }).data, nextIndex: tokens.length } };
}

function interpretAddSubtract(tokens: Array<{ type: "operand" | "operator"; value: string }>, startIndex: number, scope: VariableScope | null = null): Result<number | bigint, string> {
  const mdResult = interpretMultiplyDivide(tokens, startIndex, scope);

  if (!mdResult.success) {
    return mdResult;
  }

  let result_data: number | bigint = (mdResult as { success: true; data: { value: number | bigint; nextIndex: number } }).data.value;
  let i: number = (mdResult as { success: true; data: { value: number | bigint; nextIndex: number } }).data.nextIndex;

  while (i < tokens.length) {
    if (tokens[i].type !== "operator") {
      return { success: false, error: "Invalid expression" };
    }

    const operator = tokens[i].value;
    if (i + 1 >= tokens.length || tokens[i + 1].type !== "operand") {
      return { success: false, error: "Invalid expression" };
    }

    const rightMdResult = interpretMultiplyDivide(tokens, i + 1, scope);
    if (!rightMdResult.success) {
      return rightMdResult;
    }

    const right_data: number | bigint = (rightMdResult as { success: true; data: { value: number | bigint; nextIndex: number } }).data.value;
    const opName = operator === "+" ? "add" : "subtract";

    const opResult: Result<number | bigint, string> = performOperation(result_data, right_data, tokens[i - 1].value, tokens[i + 1].value, opName);

    if (!opResult.success) {
      return opResult;
    }

    result_data = (opResult as { success: true; data: number | bigint }).data;
    tokens[i + 1].value = String(result_data);
    i = (rightMdResult as { success: true; data: { value: number | bigint; nextIndex: number } }).data.nextIndex;
  }

  return { success: true, data: result_data };
}

export function interpret(input: string, scope: VariableScope | null = null): Result<number | bigint, string> {
  const trimmedInput = input.trim();

  if (trimmedInput.includes(";")) {
    const parseResult = parseStatementBlock(trimmedInput);
    if (parseResult.success) {
      return interpretStatementBlock(trimmedInput, scope);
    }
  }

  if (trimmedInput.includes("(") || trimmedInput.includes(")") || trimmedInput.includes("{") || trimmedInput.includes("}")) {
    const evaluated = evaluateParenthesizedExpressions(trimmedInput, scope);
    if (evaluated === "") {
      return { success: false, error: "Invalid grouped expression" };
    }
    return interpret(evaluated, scope);
  }

  if (scope !== null && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedInput)) {
    const lookupResult = lookupVariable(scope, trimmedInput);
    if (lookupResult.success) {
      return { success: true, data: (lookupResult as { success: true; data: Variable }).data.value };
    } else {
      return lookupResult;
    }
  }

  if (trimmedInput.includes(" + ") || trimmedInput.includes(" - ") || trimmedInput.includes(" * ") || trimmedInput.includes(" / ")) {
    const tokens = tokenizeExpression(trimmedInput);

    if (tokens.length >= 3 && tokens[0].type === "operand") {
      const result = interpretAddSubtract(tokens, 0, scope);

      if (!result.success) {
        return result;
      }

      return result;
    }
  }

  for (const [typeName, range] of Object.entries(TYPE_RANGES)) {
    if (trimmedInput.endsWith(typeName)) {
      const numberStr = trimmedInput.slice(0, -typeName.length);

      if (typeName === "U64" || typeName === "I64") {
        const value = BigInt(numberStr);
        return validateNumber(value, range, typeName);
      }

      const value = Number(numberStr);
      return validateNumber(value, range, typeName);
    }
  }

  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedInput)) {
    return { success: false, error: "Undefined variable: " + trimmedInput };
  }

  return { success: true, data: Number(trimmedInput) };
}

function getTypeForValue(value: string): string | null {
  for (const typeName of Object.keys(TYPE_RANGES)) {
    if (value.endsWith(typeName)) {
      return typeName;
    }
  }
  return null;
}


