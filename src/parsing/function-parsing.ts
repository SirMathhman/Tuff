import {
  isIdentifierChar,
  findChar,
  findMatchingParen,
} from "../parsing/parser";
import { splitByCommaRespectingNesting } from "../support/helpers";

function extractFunctionName(source: string): string {
  // After "fn", extract the identifier until '('
  const afterFn = source.substring(2).trim();
  let name = "";
  for (let i = 0; i < afterFn.length; i++) {
    const char = afterFn[i];
    if (!char || !isIdentifierChar(char, i === 0)) break;
    name += char;
  }
  return name;
}

function extractParameterList(
  source: string,
  openParenIndex: number,
): string | undefined {
  const closeParenIndex = findMatchingParen(source, openParenIndex);
  if (closeParenIndex === -1) return undefined;
  return source.substring(openParenIndex + 1, closeParenIndex).trim();
}

function parseParameters(paramStr: string): { name: string; type: string }[] {
  if (paramStr.length === 0) return [];

  const params: { name: string; type: string }[] = [];
  const parts = paramStr.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    const colonIndex = findChar(trimmed, ":");
    if (colonIndex === -1) continue;

    const paramName = trimmed.substring(0, colonIndex).trim();
    const paramType = trimmed.substring(colonIndex + 1).trim();

    if (paramName.length > 0 && paramType.length > 0) {
      params.push({ name: paramName, type: paramType });
    }
  }

  return params;
}

function findReturnTypeArrow(source: string, afterParenIndex: number): number {
  for (let i = afterParenIndex; i < source.length - 1; i++) {
    if (source[i] === ":" && source[i + 1] === " ") {
      return i;
    }
  }
  return -1;
}

function extractReturnType(
  source: string,
  colonIndex: number,
): string | undefined {
  if (colonIndex === -1) return undefined;
  let i = colonIndex + 1;
  while (i < source.length && (source[i] === " " || source[i] === "\t")) {
    i++;
  }
  let returnType = "";
  while (i < source.length && source[i] !== "=" && source[i] !== ";") {
    const char = source[i];
    if (!(char === " " || char === "\t")) {
      returnType += char;
    } else if (returnType.length > 0) {
      break;
    }
    i++;
  }
  return returnType;
}

function findArrowIndex(source: string, afterReturnIndex: number): number {
  for (let i = afterReturnIndex; i < source.length - 1; i++) {
    if (source[i] === "=" && source[i + 1] === ">") {
      return i;
    }
  }
  return -1;
}

function extractFunctionBody(
  source: string,
  arrowIndex: number,
  endIndex: number,
): string {
  const afterArrow = source.substring(arrowIndex + 2).trim();
  let body: string;
  if (endIndex === -1) {
    body = afterArrow;
  } else {
    body = afterArrow.substring(0, endIndex - (arrowIndex + 2)).trim();
  }
  // Remove trailing semicolon if present
  if (body.endsWith(";")) {
    body = body.substring(0, body.length - 1).trim();
  }
  return body;
}

export function parseFunctionDefinition(source: string):
  | {
      name: string;
      parameters: { name: string; type: string }[];
      returnType: string;
      body: string;
      remaining: string;
    }
  | undefined {
  const trimmed = source.trim();

  // Support lambda syntax: () : Type => body
  const isLambda = trimmed.startsWith("(");
  if (!isLambda && !trimmed.startsWith("fn ")) return undefined;

  const openParenIndex = findChar(trimmed, "(");
  if (openParenIndex === -1) return undefined;

  // For lambda syntax, name will be empty and should be provided by caller
  const name = isLambda ? "" : extractFunctionName(trimmed);
  if (!isLambda && name.length === 0) return undefined;

  const paramStr = extractParameterList(trimmed, openParenIndex);
  if (paramStr === undefined) return undefined;

  const closeParenIndex = findMatchingParen(trimmed, openParenIndex);
  if (closeParenIndex === -1) return undefined;

  const colonIndex = findReturnTypeArrow(trimmed, closeParenIndex);
  let explicitReturnType: string | undefined;

  // Return type is optional - if no colon, search for => directly
  let arrowSearchStart = colonIndex;
  if (colonIndex !== -1) {
    explicitReturnType = extractReturnType(trimmed, colonIndex);
    arrowSearchStart = colonIndex;
  } else {
    // No explicit return type, look for => after closing paren
    arrowSearchStart = closeParenIndex;
  }

  const arrowIndex = findArrowIndex(trimmed, arrowSearchStart);
  if (arrowIndex === -1) return undefined;

  const semiIndex = findChar(trimmed, ";");
  const body = extractFunctionBody(trimmed, arrowIndex, semiIndex);
  if (body.length === 0) return undefined;

  // If no explicit return type, we'll infer it later from the body
  // For now, use a placeholder that will be replaced
  const returnType = explicitReturnType || "<inferred>"; // Placeholder for inference

  const remaining =
    semiIndex === -1 ? "" : trimmed.substring(semiIndex + 1).trim();

  return {
    name,
    parameters: parseParameters(paramStr),
    returnType,
    body,
    remaining,
  };
}

export function isFunctionDefinition(source: string): boolean {
  const trimmed = source.trim();
  // Support both "fn name() => body" and lambda "() => body" syntax
  // Return type annotation is optional
  return (
    (trimmed.startsWith("fn ") || trimmed.startsWith("(")) &&
    trimmed.includes("=>")
  );
}

function findTypeSuffixIndex(expr: string): number {
  for (let i = expr.length - 1; i >= 0; i--) {
    const char = expr[i];
    if (char && char >= "0" && char <= "9") continue;
    if (char && char >= "A" && char <= "Z") {
      return i;
    }
    break;
  }
  return -1;
}

function inferReturnTypeFromBody(body: string): string {
  // Check for boolean literals
  if (body === "true" || body === "false") {
    return "Bool";
  }
  // Check for read expressions
  if (body.startsWith("read ")) {
    const parts = body.split(" ");
    if (parts.length === 2) {
      return parts[1] || "I32";
    }
  }
  // Check for bare numbers (default to I32)
  const isBareNumber = isNumericLiteral(body);
  if (isBareNumber) {
    // Extract type suffix if present
    const suffixStart = findTypeSuffixIndex(body);
    if (suffixStart !== -1) {
      return body.substring(suffixStart);
    }
    return "I32";
  }
  return "<inferred>";
}

function isNumericLiteral(expr: string): boolean {
  if (expr.length === 0) return false;
  let i = 0;
  if (expr[0] === "-") i++;
  if (i >= expr.length) return false;
  while (i < expr.length) {
    const char = expr[i];
    if (char && char >= "0" && char <= "9") {
      i++;
      continue;
    }
    return !!(char && char >= "A" && char <= "Z");
  }
  return true;
}

export function extractFunctionType(source: string): string | undefined {
  if (!isFunctionDefinition(source)) return undefined;

  const parsed = parseFunctionDefinition(source);
  if (!parsed) return undefined;

  let returnType = parsed.returnType;

  // If return type was inferred (placeholder), we need to infer it from the body
  if (returnType === "<inferred>") {
    const body = parsed.body.trim();
    returnType = inferReturnTypeFromBody(body);
  }

  // Function type format: (param1Type, param2Type, ...) => returnType
  // For no parameters: () => returnType
  const paramTypes = parsed.parameters.map((p) => p.type).join(", ");
  return `(${paramTypes}) => ${returnType}`;
}

export function isFunctionCall(source: string): boolean {
  const trimmed = source.trim();
  if (trimmed.length === 0) return false;
  let i = 0;

  // Check if starts with identifier
  const firstChar = trimmed[0];
  if (!firstChar || !isIdentifierChar(firstChar, true)) return false;

  while (i < trimmed.length) {
    const char = trimmed[i];
    if (!char || !isIdentifierChar(char, false)) break;
    i++;
  }

  // Must be followed by (
  return i < trimmed.length && trimmed[i] === "(";
}

function extractFunctionCallName(source: string): string {
  const trimmed = source.trim();
  let name = "";
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (!char || !isIdentifierChar(char, i === 0)) break;
    name += char;
  }
  return name;
}

export function parseFunctionCall(
  source: string,
): { name: string; args: string[] } | undefined {
  if (!isFunctionCall(source)) return undefined;

  const trimmed = source.trim();
  const name = extractFunctionCallName(trimmed);
  if (name.length === 0) return undefined;

  const openParenIndex = findChar(trimmed, "(");
  if (openParenIndex === -1) return undefined;

  const closeParenIndex = findMatchingParen(trimmed, openParenIndex);
  if (closeParenIndex === -1) return undefined;

  const argsStr = trimmed.substring(openParenIndex + 1, closeParenIndex).trim();

  if (argsStr.length === 0) {
    return { name, args: [] };
  }

  // Split args by comma (respecting nested parentheses/brackets)
  return { name, args: splitByCommaRespectingNesting(argsStr) };
}
