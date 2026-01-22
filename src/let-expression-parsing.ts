import { type Instruction, OpCode, Variant } from "./vm";
import {
  type VariableContext,
  allocateVariable,
  parseLetComponents,
  isReadExpressionPattern,
  adjustReadInstructions,
  buildLetStoreInstructions,
  extractExpressionType,
} from "./let-binding";

export function parseLetExpression(
  source: string,
  compileWithContextFn: (expr: string, ctx: VariableContext) => { instructions: Instruction[]; context: VariableContext } | undefined,
  context: VariableContext,
): { instructions: Instruction[]; newContext: VariableContext } | undefined {
  if (!source.startsWith("let")) return undefined;

  const components = parseLetComponents(source);
  if (!components) return undefined;

  const { varName, exprPart, remaining, typeAnnotation } = components;
  const exprCompileResult = compileWithContextFn(exprPart, context);
  if (!exprCompileResult) return undefined;

  const exprCompile = exprCompileResult.instructions;
  if (!exprCompile || exprCompile.length === 0) return undefined;

  const varType = typeAnnotation || extractExpressionType(exprPart, context);
  const { context: newContext, address } = allocateVariable(
    context,
    varName,
    varType,
  );

  const lastInstruction = exprCompile[exprCompile.length - 1];
  let resultAddress = 900;
  if (lastInstruction && lastInstruction.opcode === OpCode.Halt) {
    resultAddress = lastInstruction.operand1;
  }
  if (isReadExpressionPattern(exprPart)) resultAddress = 903;
  const storeInstructions = buildLetStoreInstructions(
    adjustReadInstructions(exprCompile.slice(0, -1), exprPart),
    resultAddress,
    address,
  );

  if (remaining.length === 0) {
    return {
      instructions: [
        ...storeInstructions,
        {
          opcode: OpCode.Halt,
          variant: Variant.Immediate,
          operand1: 0,
        },
      ],
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
