import { type Instruction, OpCode, Variant } from "./vm";
import {
  findChar,
  extractVariableName,
  getTypeSuffix,
  isParenthesizedExpression,
  extractParenthesizedContent,
  isBracedExpression,
  extractBracedContent,
  parseBooleanLiteral,
  findConditionParentheses,
  findElseKeyword,
  isIdentifierChar,
  isReferenceOperator,
  extractReferenceTarget,
  isMutableReference,
} from "./parser";
import {
  buildLoadDirect,
  buildLoadImmediate,
  buildStoreDirect,
  buildStoreAndHalt,
} from "./instruction-primitives";

export interface VariableBinding {
  name: string;
  memoryAddress: number;
  type?: string;
  mutable?: boolean;
  declarationOnly?: boolean;
}

export type VariableContext = VariableBinding[];

export function allocateVariable(
  context: VariableContext,
  varName: string,
  varType?: string,
  mutable?: boolean,
  declarationOnly?: boolean,
): { context: VariableContext; address: number } {
  const address = 904 + context.length;
  return {
    context: [
      ...context,
      {
        name: varName,
        memoryAddress: address,
        type: varType,
        mutable,
        declarationOnly,
      },
    ],
    address,
  };
}

export function resolveVariable(
  context: VariableContext,
  varName: string,
): number | undefined {
  const binding = context.find((b) => b.name === varName);
  return binding?.memoryAddress;
}

export function isVariableShadowed(
  context: VariableContext,
  varName: string,
): boolean {
  return context.some((b) => b.name === varName);
}

export function isVariableMutable(
  context: VariableContext,
  varName: string,
): boolean {
  const binding = context.find((b) => b.name === varName);
  return binding?.mutable ?? false;
}

export function buildContextFromLetBindings(source: string): VariableContext {
  const context: VariableContext = [];
  let remaining = source;

  while (remaining.length > 0) {
    remaining = remaining.trim();
    if (!remaining.startsWith("let")) break;

    const comp = parseLetComponents(remaining);
    if (!comp) break;

    let varType = comp.typeAnnotation;
    if (!varType) {
      varType = extractExpressionType(comp.exprPart, context);
    }

    // Declaration-only variables (exprPart === "")
    // Their mutability is determined by whether they have the 'mut' keyword
    // NOT implicitly made mutable just because they're declaration-only
    const isDeclarationOnly = comp.exprPart === "";

    context.push({
      name: comp.varName,
      memoryAddress: 904 + context.length,
      type: varType,
      mutable: comp.mutable,
      declarationOnly: isDeclarationOnly,
    });

    remaining = comp.remaining;
  }

  return context;
}

export function parseLetComponents(source: string):
  | {
      varName: string;
      exprPart: string;
      remaining: string;
      typeAnnotation?: string;
      mutable: boolean;
    }
  | undefined {
  const afterLet = source.substring(3).trim();
  const isMutable = afterLet.startsWith("mut");
  const varName = extractVariableName(source);
  if (varName.length === 0) return undefined;

  // Find the first semicolon to limit search scope
  const firstSemicolonIndex = findChar(source, ";");
  if (firstSemicolonIndex === -1) return undefined;

  // Only search within the current let binding (before the semicolon)
  const bindingScope = source.substring(0, firstSemicolonIndex);

  const colonIndex = findChar(bindingScope, ":");
  const equalsIndex = findChar(bindingScope, "=");

  // Extract type annotation if present
  let typeAnnotation: string | undefined;
  if (colonIndex !== -1) {
    const typePartEnd = equalsIndex === -1 ? bindingScope.length : equalsIndex;
    const typePart = bindingScope.substring(colonIndex + 1, typePartEnd).trim();
    typeAnnotation = typePart;
  }

  // If there's no equals sign, it's a declaration-only let binding (requires type annotation)
  if (equalsIndex === -1) {
    if (!typeAnnotation) return undefined;
    return {
      varName,
      exprPart: "",
      remaining: source.substring(firstSemicolonIndex + 1).trim(),
      typeAnnotation,
      mutable: isMutable,
    };
  }

  // If there's a colon, it must come before the equals sign
  if (colonIndex !== -1 && colonIndex >= equalsIndex) return undefined;

  const exprPart = bindingScope.substring(equalsIndex + 1).trim();
  const remaining = source.substring(firstSemicolonIndex + 1).trim();

  return { varName, exprPart, remaining, typeAnnotation, mutable: isMutable };
}

export function isReadExpressionPattern(exprPart: string): boolean {
  return (
    exprPart === "read U8" ||
    exprPart === "read U16" ||
    exprPart === "read I8" ||
    exprPart === "read I16" ||
    exprPart === "read Bool"
  );
}

function extractIfExpressionType(
  source: string,
  context?: VariableContext,
): string | undefined {
  const branches = extractIfBranchTypes(source, context);
  if (!branches) {
    return undefined;
  }

  const { thenType, elseType } = branches;

  // If both branches have types and match, return that type
  if (thenType && elseType && thenType === elseType) {
    return thenType;
  }

  // If one is undefined, return the other if it exists
  if (thenType && !elseType) {
    return thenType;
  }
  if (elseType && !thenType) {
    return elseType;
  }

  return undefined;
}

export function extractIfBranchTypes(
  source: string,
  context?: VariableContext,
): { thenType: string | undefined; elseType: string | undefined } | undefined {
  if (!source.startsWith("if")) {
    return undefined;
  }

  const parens = findConditionParentheses(source, 2);
  if (!parens) {
    return undefined;
  }

  const elseIndex = findElseKeyword(source, parens.end + 1);
  if (elseIndex === -1) {
    return undefined;
  }

  const thenExpr = source.substring(parens.end + 1, elseIndex).trim();
  const elseExpr = source.substring(elseIndex + 4).trim();

  const thenType = extractExpressionType(thenExpr, context);
  const elseType = extractExpressionType(elseExpr, context);

  return { thenType, elseType };
}

export function extractExpressionType(
  exprPart: string,
  context?: VariableContext,
): string | undefined {
  const trimmed = exprPart.trim();

  // For if-expressions, extract the type from branches
  if (trimmed.startsWith("if")) {
    return extractIfExpressionType(trimmed, context);
  }

  // For braced expressions, unwrap and extract from inner content
  if (isBracedExpression(trimmed)) {
    const innerExpr = extractBracedContent(trimmed);
    return extractExpressionType(innerExpr, context);
  }

  // For reference expressions (&x or &mut x), infer pointer type from variable
  if (isReferenceOperator(trimmed)) {
    const varName = extractReferenceTarget(trimmed);
    if (!context) return undefined;
    const binding = context.find((b) => b.name === varName);
    if (binding && binding.type) {
      const isMut = isMutableReference(trimmed);
      return isMut ? `*mut ${binding.type}` : `*${binding.type}`;
    }
    return undefined;
  }

  // For read expressions, extract the type directly
  if (trimmed.startsWith("read ")) {
    const parts = trimmed.split(" ");
    if (parts.length === 2) {
      return parts[1];
    }
  }

  // For boolean literals, return Bool type
  const boolValue = parseBooleanLiteral(trimmed);
  if (boolValue !== undefined) {
    return "Bool";
  }

  // For number literals, extract type suffix
  const suffix = getTypeSuffix(trimmed);
  if (suffix) {
    return suffix;
  }

  // For bare numbers without type suffix, infer a default type
  const isBareLiteral = isBareNumber(trimmed);
  if (isBareLiteral) {
    // Bare numbers default to I32 for compatibility with signed/unsigned and various sizes
    return "I32";
  }

  // For variable references, look up in context
  if (context) {
    const binding = context.find((b) => b.name === trimmed);
    if (binding && binding.type) {
      return binding.type;
    }
  }

  // If no type suffix and not a read expression, return undefined
  return undefined;
}

function validateNumericPrefix(expr: string, allowTypeChars: boolean): boolean {
  const trimmed = expr.trim();
  if (trimmed.length === 0) return false;

  let i = 0;
  if (trimmed[i] === "-") i++;

  if (i >= trimmed.length) return false;

  for (; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === undefined) return false;

    const isDigit = char >= "0" && char <= "9";
    const isTypeChar = char >= "A" && char <= "Z";

    const isValidChar = allowTypeChars ? isDigit || isTypeChar : isDigit;
    if (!isValidChar) return false;
  }

  return true;
}

export function isBareNumber(expr: string): boolean {
  return validateNumericPrefix(expr, false);
}

export function isNumberLiteral(expr: string): boolean {
  return validateNumericPrefix(expr, true);
}

export function extractArithmeticTypes(exprPart: string): string[] | undefined {
  const trimmed = exprPart.trim();

  // Check if contains operators: + - * / (scanning at depth 0 only)
  const opIndex = findTopLevelOperator(trimmed);

  if (opIndex === -1) return undefined;

  const leftPart = trimmed.substring(0, opIndex).trim();
  const rightPart = trimmed.substring(opIndex + 1).trim();

  const leftType = extractExpressionType(leftPart);
  const rightType = extractExpressionType(rightPart);

  if (!leftType || !rightType) return undefined;

  return [leftType, rightType];
}

function findTopLevelOperator(trimmed: string): number {
  let parenDepth = 0;
  let braceDepth = 0;

  for (let i = 1; i < trimmed.length; i++) {
    const char = trimmed[i];

    // Track depth of parentheses and braces
    if (char === "(") parenDepth++;
    if (char === ")") parenDepth--;
    if (char === "{") braceDepth++;
    if (char === "}") braceDepth--;

    // Check for operators at depth 0 only
    const isOperator =
      char === "+" || char === "-" || char === "*" || char === "/";
    const isTopLevel = parenDepth === 0 && braceDepth === 0;

    if (isOperator && isTopLevel) {
      return i;
    }
  }

  return -1;
}

export function hasArithmeticMismatch(exprPart: string): boolean {
  let unwrapped = exprPart;

  // Unwrap parentheses if the entire expression is wrapped
  if (isParenthesizedExpression(exprPart)) {
    unwrapped = extractParenthesizedContent(exprPart);
  } else if (isBracedExpression(exprPart)) {
    unwrapped = extractBracedContent(exprPart);
  }

  const types = extractArithmeticTypes(unwrapped);
  if (!types || types.length < 2) return false;

  // All operands must have the same type
  const firstType = types[0];
  return types.some((t) => t !== firstType);
}

export function adjustReadInstructions(
  instructions: Instruction[],
  exprPart: string,
): Instruction[] {
  if (!isReadExpressionPattern(exprPart)) return instructions;

  // Remap Store(901) to Store(903) to avoid conflicts
  return instructions.map((inst) => {
    if (inst.opcode === OpCode.Store && inst.operand2 === 901) {
      return { ...inst, operand2: 903 };
    }
    return inst;
  });
}

export function buildLetFinalInstructions(address: number): Instruction[] {
  return [buildLoadDirect(1, address), ...buildStoreAndHalt()];
}

export function buildLetStoreInstructions(
  adjustedInstructions: Instruction[],
  resultAddress: number,
  address: number,
): Instruction[] {
  return [
    ...adjustedInstructions,
    buildLoadDirect(1, resultAddress),
    buildStoreDirect(1, address),
  ];
}

export function buildVarRefInstructions(varAddress: number): Instruction[] {
  return [buildLoadDirect(1, varAddress), ...buildStoreAndHalt()];
}

export function buildReferenceAddressInstructions(
  varAddress: number,
): Instruction[] {
  // For a reference (&x), we want the ADDRESS to be stored, not the value
  // We load the address as an immediate value
  return [buildLoadImmediate(1, varAddress), ...buildStoreAndHalt()];
}

export function buildVarRefInstructionsForBinding(
  varAddress: number,
): Instruction[] {
  return [
    buildLoadDirect(1, varAddress),
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 1,
      operand2: 900,
    },
    {
      opcode: OpCode.Halt,
      variant: Variant.Immediate,
      operand1: 900,
    },
  ];
}

function extractReassignmentBase(
  source: string,
):
  | { bindingScope: string; remaining: string; equalsIndex: number }
  | undefined {
  const trimmed = source.trim();
  const firstSemicolonIndex = findChar(trimmed, ";");
  if (firstSemicolonIndex === -1) return undefined;

  const bindingScope = trimmed.substring(0, firstSemicolonIndex);
  const equalsIndex = findChar(bindingScope, "=");
  if (equalsIndex === -1) return undefined;

  const remaining = trimmed.substring(firstSemicolonIndex + 1).trim();
  return { bindingScope, remaining, equalsIndex };
}

function isValidIdentifier(name: string): boolean {
  if (name.length === 0) return false;
  for (let i = 0; i < name.length; i++) {
    const char = name[i];
    if (!char || !isIdentifierChar(char, i === 0)) return false;
  }
  return true;
}

export function parseReassignmentComponents(source: string):
  | {
      varName: string;
      exprPart: string;
      remaining: string;
    }
  | undefined {
  const base = extractReassignmentBase(source);
  if (!base) return undefined;

  const { bindingScope, remaining, equalsIndex } = base;
  const varName = bindingScope.substring(0, equalsIndex).trim();
  const exprPart = bindingScope.substring(equalsIndex + 1).trim();

  if (!isValidIdentifier(varName)) return undefined;

  return { varName, exprPart, remaining };
}

export function parseDereferenceReassignmentComponents(source: string):
  | {
      pointerName: string;
      exprPart: string;
      remaining: string;
    }
  | undefined {
  const base = extractReassignmentBase(source);
  if (!base) return undefined;

  const { bindingScope, remaining, equalsIndex } = base;
  const leftSide = bindingScope.substring(0, equalsIndex).trim();

  if (!leftSide.startsWith("*")) return undefined;

  const pointerName = leftSide.substring(1).trim();

  if (!isValidIdentifier(pointerName)) return undefined;

  const exprPart = bindingScope.substring(equalsIndex + 1).trim();

  return { pointerName, exprPart, remaining };
}

export function buildReassignmentInstructions(
  exprInstructions: Instruction[],
  varAddress: number,
): Instruction[] {
  return [
    ...exprInstructions.slice(0, -1),
    buildLoadDirect(1, 900),
    buildStoreDirect(1, varAddress),
  ];
}

export function buildDereferenceReassignmentInstructions(
  exprInstructions: Instruction[],
  pointerAddress: number,
): Instruction[] {
  return [
    ...exprInstructions.slice(0, -1),
    buildLoadDirect(1, 900),
    buildLoadDirect(0, pointerAddress),
    buildStoreDirect(0, 902), // Store pointer value (the address) to temp location 902
    {
      opcode: OpCode.Store,
      variant: Variant.Indirect,
      operand1: 1,
      operand2: 902, // Use 902 as the address reference
    },
  ];
}

export function buildDereferenceInstructions(
  varAddress: number,
): Instruction[] {
  return [
    buildLoadDirect(0, varAddress),
    {
      opcode: OpCode.Load,
      variant: Variant.Indirect,
      operand1: 0,
      operand2: 0,
    },
    ...buildStoreAndHalt(),
  ];
}

export function buildDereferenceInstructionsForExpr(
  varAddress: number,
): Instruction[] {
  return [
    buildLoadDirect(0, varAddress),
    {
      opcode: OpCode.Load,
      variant: Variant.Indirect,
      operand1: 0,
      operand2: 0,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 0,
      operand2: 900,
    },
  ];
}
