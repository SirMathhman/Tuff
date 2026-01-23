import { execute, type Instruction, OpCode, Variant } from "./core/vm";
import { type Dump, type ExecutionState } from "./core/debug-dump";
import { type CompileError } from "./types/types";
import {
  parseExpression,
  type Expression,
  type Result,
  ok,
  err,
  createCompileError,
  getSuffixInfo,
} from "./parser";

function createInstruction(
  opcode: OpCode,
  variant: Variant,
  operand1: number,
  operand2?: number,
): Instruction {
  return { opcode, variant, operand1, operand2 };
}

function getOpCode(op: "+" | "-" | "*" | "/"): OpCode {
  switch (op) {
    case "+":
      return OpCode.Add;
    case "-":
      return OpCode.Sub;
    case "*":
      return OpCode.Mul;
    case "/":
      return OpCode.Div;
  }
}

function compileLiteral(
  expr: Expression & { type: "literal" },
  nextRegister: number,
): Result<
  { instructions: Instruction[]; resultRegister: number },
  CompileError
> {
  const instructions = [
    createInstruction(OpCode.Load, Variant.Immediate, nextRegister, expr.value),
  ];
  return ok({ instructions, resultRegister: nextRegister });
}

function compileRead(
  nextRegister: number,
): Result<
  { instructions: Instruction[]; resultRegister: number },
  CompileError
> {
  const instructions = [
    createInstruction(OpCode.In, Variant.Immediate, nextRegister),
  ];
  return ok({ instructions, resultRegister: nextRegister });
}

const EXPRESSION_HANDLERS: Record<
  string,
  (
    expr: Expression,
    nextRegister: number,
    variableMap: Map<string, number>,
  ) => Result<
    { instructions: Instruction[]; resultRegister: number },
    CompileError
  >
> = {
  literal: (expr, nextRegister) => compileLiteral(expr, nextRegister),
  read: (expr, nextRegister) => compileRead(nextRegister),
  block: (expr, nextRegister, variableMap) =>
    compileBlockWithContext(expr, nextRegister, variableMap),
  binary: (expr, nextRegister, variableMap) =>
    compileBinaryWithContext(expr, nextRegister, variableMap),
};

function compileByType(
  expr: Expression,
  nextRegister: number,
  variableMap: Map<string, number>,
): Result<
  { instructions: Instruction[]; resultRegister: number },
  CompileError
> {
  const handler = EXPRESSION_HANDLERS[expr.type];
  if (handler) {
    return handler(expr, nextRegister, variableMap);
  }

  // Handle variable
  const varExpr = expr as Expression & { type: "variable" };
  const reg = variableMap.get(varExpr.name);
  if (reg === undefined) {
    return err(
      createCompileError(
        "Undefined variable",
        `Variable '${varExpr.name}' is not defined`,
        "Make sure the variable is declared with a let binding",
        varExpr.name.length,
      ),
    );
  }
  return ok({
    instructions: [],
    resultRegister: reg,
  });
}

function compileExpressionWithContext(
  expr: Expression,
  nextRegister: number,
  variableMap: Map<string, number>,
): Result<
  { instructions: Instruction[]; resultRegister: number },
  CompileError
> {
  return compileByType(expr, nextRegister, variableMap);
}

function compileBinaryWithContext(
  expr: Expression & { type: "binary" },
  nextRegister: number,
  variableMap: Map<string, number>,
): Result<
  { instructions: Instruction[]; resultRegister: number },
  CompileError
> {
  const leftResult = compileExpressionWithContext(
    expr.left,
    nextRegister,
    variableMap,
  );
  if (!leftResult.ok) return leftResult;

  const rightResult = compileExpressionWithContext(
    expr.right,
    leftResult.value.resultRegister + 1,
    variableMap,
  );
  if (!rightResult.ok) return rightResult;

  const leftReg = leftResult.value.resultRegister;
  const rightReg = rightResult.value.resultRegister;
  const opcode = getOpCode(expr.op);

  const instructions = [
    ...leftResult.value.instructions,
    ...rightResult.value.instructions,
    createInstruction(opcode, Variant.Immediate, leftReg, rightReg),
  ];

  return ok({
    instructions,
    resultRegister: leftReg,
  });
}

function compileBlockWithContext(
  expr: Expression & { type: "block" },
  nextRegister: number,
  parentVariableMap: Map<string, number>,
): Result<
  { instructions: Instruction[]; resultRegister: number },
  CompileError
> {
  const instructions: Instruction[] = [];
  let currentRegister = nextRegister;
  const variableMap = new Map(parentVariableMap);

  for (const statement of expr.statements) {
    const suffixInfo = getSuffixInfo(statement.typeStr);
    if (!suffixInfo) {
      return err(
        createCompileError(
          "Invalid type in let statement",
          `Unknown type: ${statement.typeStr}`,
          "Use format like 'U8', 'I32', etc.",
          statement.typeStr.length,
        ),
      );
    }

    const valueResult = compileExpressionWithContext(
      statement.value,
      currentRegister,
      variableMap,
    );
    if (!valueResult.ok) return valueResult;

    instructions.push(...valueResult.value.instructions);
    variableMap.set(statement.name, valueResult.value.resultRegister);
    currentRegister = valueResult.value.resultRegister + 1;
  }

  const resultCompile = compileExpressionWithContext(
    expr.result,
    currentRegister,
    variableMap,
  );
  if (!resultCompile.ok) return resultCompile;

  instructions.push(...resultCompile.value.instructions);

  return ok({
    instructions,
    resultRegister: resultCompile.value.resultRegister,
  });
}

function compileExpression(
  expr: Expression,
  nextRegister: number,
): Result<
  { instructions: Instruction[]; resultRegister: number },
  CompileError
> {
  return compileExpressionWithContext(expr, nextRegister, new Map());
}

export function compile(source: string): Result<Instruction[], CompileError> {
  const exprResult = parseExpression(source.trim());
  if (!exprResult.ok) return exprResult;

  const compileResult = compileExpression(exprResult.value, 0);
  if (!compileResult.ok) return compileResult;

  const instructions = [
    ...compileResult.value.instructions,
    createInstruction(
      OpCode.Halt,
      Variant.Direct,
      compileResult.value.resultRegister,
    ),
  ];

  return ok(instructions);
}

function createStdoutWriter(): (value: number) => void {
  return (value: number) => {
    console.log("Output:", value);
  };
}

export function executeWithArray(
  instructions: Instruction[],
  stdIn: number[],
): number {
  return execute(
    instructions,
    () => {
      // Read from stdIn
      return stdIn.shift() ?? 0;
    },
    createStdoutWriter(),
  );
}

export function executeWithArrayToDump(
  instructions: Instruction[],
  stdIn: number[],
): [number, Dump] {
  const dump: Dump = { cycles: [] };
  const returnValue = execute(
    instructions,
    () => {
      // Read from stdIn
      return stdIn.shift() ?? 0;
    },
    createStdoutWriter(),
    (state: ExecutionState, instruction: Instruction) => {
      // Dumper function to capture state before each instruction
      dump.cycles.push({
        beforeInstructionExecuted: { ...state },
        instructionToExecute: instruction,
      });
    },
  );
  return [returnValue, dump];
}
