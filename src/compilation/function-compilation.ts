import { type Instruction, OpCode, Variant } from "../core/vm";
import { type VariableContext } from "../types/variable-types";
import { type FunctionContext } from "../types/function-types";
import { parseFunctionCall } from "../parsing/function-parsing";
import { isFunctionType } from "../types/types";

type CompileFunc = (
  expr: string,
  ctx: VariableContext,
) => { instructions: Instruction[]; context: VariableContext } | undefined;

function compileArgumentsToParameterSlots(
  args: string[],
  compileWithContext: CompileFunc,
): Instruction[] | undefined {
  const argInstructions: Instruction[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) return undefined;

    const compiledArg = compileWithContext(arg, []);
    if (!compiledArg) return undefined;

    argInstructions.push(
      ...compiledArg.instructions.slice(0, -1),
      {
        opcode: OpCode.Load,
        variant: Variant.Direct,
        operand1: 1,
        operand2: 900,
      },
      {
        opcode: OpCode.Store,
        variant: Variant.Direct,
        operand1: 1,
        operand2: 960 + i,
      },
    );
  }
  return argInstructions;
}

function createParameterContext(
  parameters: { name: string; type: string }[],
): VariableContext {
  return parameters.map((param, index) => ({
    name: param.name,
    memoryAddress: 960 + index,
    type: param.type,
    mutable: false,
  }));
}

function tryCallFunctionVariable(
  callInfo: ReturnType<typeof parseFunctionCall>,
  variableContext: VariableContext,
  compileWithContext: CompileFunc,
): { instructions: Instruction[]; returnType: string } | undefined {
  if (!callInfo) return undefined;

  const varBinding = variableContext.find((v) => v.name === callInfo.name);
  if (!varBinding || !varBinding.type || !isFunctionType(varBinding.type)) {
    return undefined;
  }

  if (!varBinding.functionBody || !varBinding.functionParameters) {
    return undefined;
  }

  if (callInfo.args.length !== varBinding.functionParameters.length) {
    return undefined;
  }

  const argInstructions = compileArgumentsToParameterSlots(
    callInfo.args,
    compileWithContext,
  );
  if (!argInstructions) return undefined;

  const funcContext = createParameterContext(varBinding.functionParameters);
  const bodyCompiled = compileWithContext(varBinding.functionBody, funcContext);
  if (!bodyCompiled) return undefined;

  const returnType = varBinding.type.substring(varBinding.type.indexOf("=>") + 2).trim();

  return {
    instructions: [...argInstructions, ...bodyCompiled.instructions],
    returnType,
  };
}

export function tryFunctionCall(
  source: string,
  variableContext: VariableContext,
  functionContext: FunctionContext,
  compileWithContext: CompileFunc,
): { instructions: Instruction[]; returnType: string } | undefined {
  const callInfo = parseFunctionCall(source);
  if (!callInfo) return undefined;

  const varResult = tryCallFunctionVariable(
    callInfo,
    variableContext,
    compileWithContext,
  );
  if (varResult) return varResult;

  const func = functionContext.find((f) => f.name === callInfo.name);
  if (!func) return undefined;

  if (callInfo.args.length !== func.parameters.length) return undefined;

  const argInstructions = compileArgumentsToParameterSlots(
    callInfo.args,
    compileWithContext,
  );
  if (!argInstructions) return undefined;

  const funcContext = createParameterContext(func.parameters);
  const bodyCompiled = compileWithContext(func.body, funcContext);
  if (!bodyCompiled) return undefined;

  return {
    instructions: [...argInstructions, ...bodyCompiled.instructions],
    returnType: func.returnType,
  };
}
