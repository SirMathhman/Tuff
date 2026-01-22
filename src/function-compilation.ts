import { type Instruction, OpCode, Variant } from "./vm";
import { type VariableContext } from "./variable-types";
import { type FunctionContext } from "./function-types";
import { parseFunctionCall } from "./function-parsing";

type CompileFunc = (
  expr: string,
  ctx: VariableContext,
) => { instructions: Instruction[]; context: VariableContext } | undefined;

export function tryFunctionCall(
  source: string,
  functionContext: FunctionContext,
  compileWithContext: CompileFunc,
): { instructions: Instruction[]; returnType: string } | undefined {
  const callInfo = parseFunctionCall(source);
  if (!callInfo) return undefined;

  const func = functionContext.find((f) => f.name === callInfo.name);
  if (!func) return undefined;

  // Validate argument count
  if (callInfo.args.length !== func.parameters.length) {
    return undefined;
  }

  // Compile argument expressions
  const argInstructions: Instruction[] = [];
  for (let i = 0; i < callInfo.args.length; i++) {
    const arg = callInfo.args[i];
    if (!arg) return undefined;

    const compiledArg = compileWithContext(arg, []);
    if (!compiledArg) return undefined;

    // Store argument to parameter slots (starting at 960)
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

  // Create a context for the function with parameter bindings
  const funcContext: VariableContext = func.parameters.map((param, index) => ({
    name: param.name,
    memoryAddress: 960 + index,
    type: param.type,
    mutable: false,
  }));

  // Compile the function body with the parameter context
  const bodyCompiled = compileWithContext(func.body, funcContext);
  if (!bodyCompiled) return undefined;

  return {
    instructions: [...argInstructions, ...bodyCompiled.instructions],
    returnType: func.returnType,
  };
}
