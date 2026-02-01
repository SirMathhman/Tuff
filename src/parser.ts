import { Result, VariableScope, Variable, FunctionParameter } from "./types";
import { canCoerceType, getTypeForValue } from "./operators";
import { lookupVariable, declareVariable, declareFunction } from "./executor";
import { getInterpret } from "./lazy";

// Lazy import to avoid circular dependency at module load time

export function parseStatementBlock(input: string): Result<{ statements: string[]; finalExpr: string }, string> {
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

export function inferAndValidateType(valueStr: string, targetType: string | null, value: number | bigint, scope: VariableScope | null): Result<string, string> {
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

export function parseVariableDeclaration(stmt: string, scope: VariableScope): Result<void, string> {
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

   const valueResult = getInterpret()(valueStr, scope);
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

export function parseFunctionDeclaration(stmt: string, scope: VariableScope): Result<void, string> {
  const trimmed = stmt.trim();

  if (!trimmed.startsWith("fn ")) {
    return { success: false, error: "Expected 'fn' keyword" };
  }

  const rest = trimmed.slice(3).trim();
  const parenStart = rest.indexOf("(");
  const parenEnd = rest.indexOf(")");
  const arrow = rest.indexOf("->");

  if (parenStart === -1 || parenEnd === -1 || arrow === -1) {
    return { success: false, error: "Invalid function declaration format" };
  }

  const funcName = rest.slice(0, parenStart).trim();
  const paramsStr = rest.slice(parenStart + 1, parenEnd).trim();
  const afterArrow = rest.slice(arrow + 2).trim();

  const braceStart = afterArrow.indexOf("{");
  if (braceStart === -1) {
    return { success: false, error: "Expected '{' in function body" };
  }

  const bodyStart = braceStart + 1;
  const bodyEnd = afterArrow.lastIndexOf("}");

  if (bodyEnd === -1 || bodyEnd <= bodyStart) {
    return { success: false, error: "Invalid function body" };
  }

  const returnType = afterArrow.slice(0, braceStart).trim();
  const body = afterArrow.slice(bodyStart, bodyEnd).trim();

  const parameters: FunctionParameter[] = [];
  if (paramsStr) {
    const paramParts = paramsStr.split(",");
    for (const paramPart of paramParts) {
      const colonIdx = paramPart.indexOf(":");
      if (colonIdx === -1) {
        return { success: false, error: "Expected ':' in parameter" };
      }
      const paramName = paramPart.slice(0, colonIdx).trim();
      const paramType = paramPart.slice(colonIdx + 1).trim();
      parameters.push({ name: paramName, type: paramType });
    }
  }

  return declareFunction(scope, funcName, parameters, returnType, body);
}

export function parseFunctionCall(input: string, scope: VariableScope): Result<{ name: string; args: (number | bigint)[]; argTypes: (string | null)[]; endIndex: number }, string> {
  const parenStart = input.indexOf("(");
  let parenEnd = -1;
  let depth = 0;

  for (let i = parenStart; i < input.length; i++) {
    if (input[i] === "(") {
      depth++;
    } else if (input[i] === ")") {
      depth--;
      if (depth === 0) {
        parenEnd = i;
        break;
      }
    }
  }

  if (parenStart === -1 || parenEnd === -1 || parenStart >= parenEnd) {
    return { success: false, error: "Invalid function call" };
  }

  const funcName = input.slice(0, parenStart).trim();
  const argsStr = input.slice(parenStart + 1, parenEnd).trim();

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(funcName)) {
    return { success: false, error: "Invalid function name" };
  }

  const args: (number | bigint)[] = [];
  const argTypes: (string | null)[] = [];

  if (argsStr) {
    const argParts = argsStr.split(",");
    for (const argPart of argParts) {
      const argTrimmed = argPart.trim();
       const argResult = getInterpret()(argTrimmed, scope);
      if (!argResult.success) {
        return argResult as unknown as Result<{ name: string; args: (number | bigint)[]; argTypes: (string | null)[]; endIndex: number }, string>;
      }
      args.push((argResult as { success: true; data: number | bigint }).data);
      argTypes.push(getTypeForValue(argTrimmed));
    }
  }

  return { success: true, data: { name: funcName, args, argTypes, endIndex: parenEnd } };
}

export function tokenizeExpression(input: string): Array<{ type: "operand" | "operator"; value: string }> {
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