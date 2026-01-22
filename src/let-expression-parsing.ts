import { type Instruction, OpCode, Variant } from "./vm";
import { type VariableContext } from "./variable-types";
import {
  allocateVariable,
  parseLetComponents,
  isReadExpressionPattern,
  adjustReadInstructions,
  buildLetStoreInstructions,
  extractExpressionType,
} from "./let-binding";
import { isReferenceOperator, extractReferenceTarget } from "./parser";

function determineResultAddress(
  exprCompile: Instruction[],
  exprPart: string,
): number {
  let resultAddress = 900;
  const lastInstruction = exprCompile[exprCompile.length - 1];
  if (lastInstruction && lastInstruction.opcode === OpCode.Halt) {
    resultAddress = lastInstruction.operand1;
  }
  if (isReadExpressionPattern(exprPart)) resultAddress = 903;
  return resultAddress;
}

function buildHaltInstruction(): Instruction {
  return {
    opcode: OpCode.Halt,
    variant: Variant.Immediate,
    operand1: 0,
  };
}

function parseDeclarationOnlyBinding(
  varName: string,
  typeAnnotation: string,
  remaining: string,
  context: VariableContext,
  compileWithContextFn: (
    expr: string,
    ctx: VariableContext,
  ) => { instructions: Instruction[]; context: VariableContext } | undefined,
): { instructions: Instruction[]; newContext: VariableContext } | undefined {
  // Declaration-only variables are implicitly mutable since they must be initialized later
  const { context: newContext } = allocateVariable(
    context,
    varName,
    typeAnnotation,
    true, // Always mutable for declaration-only
    true, // Mark as declaration-only
  );

  if (remaining.length === 0) {
    return {
      instructions: [buildHaltInstruction()],
      newContext,
    };
  }

  const remainingResult = compileWithContextFn(remaining, newContext);
  if (!remainingResult) return undefined;

  return {
    instructions: remainingResult.instructions,
    newContext,
  };
}

function parseInitializedBinding(
  varName: string,
  exprPart: string,
  remaining: string,
  typeAnnotation: string | undefined,
  mutable: boolean,
  context: VariableContext,
  exprCompile: Instruction[],
  compileWithContextFn: (
    expr: string,
    ctx: VariableContext,
  ) => { instructions: Instruction[]; context: VariableContext } | undefined,
): { instructions: Instruction[]; newContext: VariableContext } | undefined {
  const varType = typeAnnotation || extractExpressionType(exprPart, context);

  // For slice creation (&array), track the source array name
  let sourceArrayName: string | undefined;
  const trimmedExpr = exprPart.trim();
  if (isReferenceOperator(trimmedExpr)) {
    sourceArrayName = extractReferenceTarget(trimmedExpr);
  }

  const { context: newContext, address } = allocateVariable(
    context,
    varName,
    varType,
    mutable,
    false,
    sourceArrayName,
  );

  // For array types, skip the store step - elements are already in place
  const isArray = varType && varType.startsWith("[");
  const storeInstructions = isArray
    ? exprCompile.slice(0, -1) // Just the array literal instructions, no store
    : buildLetStoreInstructions(
        adjustReadInstructions(exprCompile.slice(0, -1), exprPart),
        determineResultAddress(exprCompile, exprPart),
        address,
      );

  if (remaining.length === 0) {
    return {
      instructions: [...storeInstructions, buildHaltInstruction()],
      newContext,
    };
  }

  const remainingResult = compileWithContextFn(remaining, newContext);
  if (!remainingResult) return undefined;

  return {
    instructions: [...storeInstructions, ...remainingResult.instructions],
    newContext,
  };
}

export function parseLetExpression(
  source: string,
  compileWithContextFn: (
    expr: string,
    ctx: VariableContext,
  ) => { instructions: Instruction[]; context: VariableContext } | undefined,
  context: VariableContext,
): { instructions: Instruction[]; newContext: VariableContext } | undefined {
  if (!source.startsWith("let")) return undefined;

  const components = parseLetComponents(source);
  if (!components) return undefined;

  const { varName, exprPart, remaining, typeAnnotation, mutable } = components;

  // Handle declaration-only bindings (let x : Type;)
  if (exprPart === "") {
    if (!typeAnnotation) return undefined;
    return parseDeclarationOnlyBinding(
      varName,
      typeAnnotation,
      remaining,
      context,
      compileWithContextFn,
    );
  }

  const exprCompileResult = compileWithContextFn(exprPart, context);
  if (!exprCompileResult) return undefined;

  const exprCompile = exprCompileResult.instructions;
  if (!exprCompile || exprCompile.length === 0) return undefined;

  return parseInitializedBinding(
    varName,
    exprPart,
    remaining,
    typeAnnotation,
    mutable,
    context,
    exprCompile,
    compileWithContextFn,
  );
}
