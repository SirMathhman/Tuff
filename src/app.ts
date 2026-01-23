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

function getExpressionType(
  expr: Expression,
  variableTypeMap?: Map<string, string>,
): string {
  if (expr.type === "literal") return "U8"; // Literals default to U8
  if (expr.type === "read") return expr.typeStr;
  if (expr.type === "block")
    return getExpressionType(expr.result, variableTypeMap);
  if (expr.type === "binary")
    return getExpressionType(expr.left, variableTypeMap);
  if (expr.type === "variable") {
    // Look up the variable type if we have a type map
    if (variableTypeMap && variableTypeMap.has(expr.name)) {
      return variableTypeMap.get(expr.name) || "";
    }
    return "";
  }
  return "";
}

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

function createUndefinedVariableError(varName: string): CompileError {
  return createCompileError(
    "Undefined variable",
    `Variable '${varName}' is not defined`,
    "Make sure the variable is declared with a let binding",
    varName.length,
  );
}

function compileAssignmentExpression(
  expr: Expression & { type: "assignment" },
  nextRegister: number,
  variableMap: Map<string, number>,
  variableTypeMap?: Map<string, string>,
): Result<
  { instructions: Instruction[]; resultRegister: number },
  CompileError
> {
  const varReg = variableMap.get(expr.name);
  if (varReg === undefined) {
    return err(createUndefinedVariableError(expr.name));
  }

  const valueResult = compileExpressionWithContext(
    expr.value,
    nextRegister,
    variableMap,
    variableTypeMap,
  );
  if (!valueResult.ok) return valueResult;

  return ok({
    instructions: valueResult.value.instructions,
    resultRegister: valueResult.value.resultRegister,
  });
}

function compileByType(
  expr: Expression,
  nextRegister: number,
  variableMap: Map<string, number>,
  variableTypeMap?: Map<string, string>,
): Result<
  { instructions: Instruction[]; resultRegister: number },
  CompileError
> {
  // Dispatch to special handlers that need the type map
  if (expr.type === "block")
    return compileBlockWithContext(
      expr as Expression & { type: "block" },
      nextRegister,
      variableMap,
      variableTypeMap,
    );
  if (expr.type === "assignment")
    return compileAssignmentExpression(
      expr as Expression & { type: "assignment" },
      nextRegister,
      variableMap,
      variableTypeMap,
    );

  const handler = EXPRESSION_HANDLERS[expr.type];
  if (handler) {
    return handler(expr, nextRegister, variableMap);
  }

  // Handle variable
  const varExpr = expr as Expression & { type: "variable" };
  const reg = variableMap.get(varExpr.name);
  if (reg === undefined) {
    return err(createUndefinedVariableError(varExpr.name));
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
  variableTypeMap?: Map<string, string>,
): Result<
  { instructions: Instruction[]; resultRegister: number },
  CompileError
> {
  return compileByType(expr, nextRegister, variableMap, variableTypeMap);
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

function checkDuplicateVariable(
  name: string,
  variableMap: Map<string, number>,
): Result<true, CompileError> {
  if (variableMap.has(name)) {
    return err(
      createCompileError(
        "Duplicate variable name",
        `Variable '${name}' is already defined`,
        "Use a different name for this variable",
        name.length,
      ),
    );
  }
  return ok(true);
}

function validateTypeAnnotation(typeStr: string): Result<true, CompileError> {
  if (typeStr === "") return ok(true);

  const suffixInfo = getSuffixInfo(typeStr);
  if (!suffixInfo) {
    return err(
      createCompileError(
        "Invalid type annotation",
        `Unknown type: ${typeStr}`,
        "Use format like 'U8', 'I32', etc.",
        typeStr.length,
      ),
    );
  }
  return ok(true);
}

function isTypeCompatible(fromType: string, toType: string): boolean {
  if (fromType === toType) return true;
  if (fromType === "" || toType === "") return true; // Unknown types are compatible

  // Type widening compatibility: smaller types can be widened to larger types
  const widthMap: Record<string, number> = {
    I8: 1,
    U8: 1,
    I16: 2,
    U16: 2,
    I32: 4,
    U32: 4,
    I64: 8,
    U64: 8,
  };

  const fromWidth = widthMap[fromType];
  const toWidth = widthMap[toType];

  if (fromWidth === undefined || toWidth === undefined) return false;

  // Allow widening (smaller to larger)
  return fromWidth <= toWidth;
}

function checkTypeMismatch(
  declaredType: string,
  expr: Expression,
  variableTypeMap?: Map<string, string>,
): Result<true, CompileError> {
  if (declaredType === "") return ok(true);

  const exprType = getExpressionType(expr, variableTypeMap);
  if (exprType !== "" && !isTypeCompatible(exprType, declaredType)) {
    return err(
      createCompileError(
        "Type mismatch",
        `Expected ${declaredType} but expression is ${exprType}`,
        "Make sure the expression matches the declared type",
        declaredType.length,
      ),
    );
  }
  return ok(true);
}

function determineVariableType(
  declaredType: string,
  expr: Expression,
  variableTypeMap: Map<string, string>,
): string {
  if (declaredType !== "") {
    return declaredType;
  }
  // Implicit type inference from the expression
  return getExpressionType(expr, variableTypeMap);
}

function processBlockStatement(
  statement: { name: string; typeStr: string; value: Expression },
  instructions: Instruction[],
  currentRegister: number,
  variableMap: Map<string, number>,
  variableTypeMap: Map<string, string>,
): Result<number, CompileError> {
  let typeCheck = validateTypeAnnotation(statement.typeStr);
  if (!typeCheck.ok) return typeCheck;

  typeCheck = checkDuplicateVariable(statement.name, variableMap) as Result<
    true,
    CompileError
  >;
  if (!typeCheck.ok) return typeCheck;

  const valueResult = compileExpressionWithContext(
    statement.value,
    currentRegister,
    variableMap,
  );
  if (!valueResult.ok) return valueResult;

  typeCheck = checkTypeMismatch(
    statement.typeStr,
    statement.value,
    variableTypeMap,
  );
  if (!typeCheck.ok) return typeCheck;

  const actualType = determineVariableType(
    statement.typeStr,
    statement.value,
    variableTypeMap,
  );

  instructions.push(...valueResult.value.instructions);
  variableMap.set(statement.name, valueResult.value.resultRegister);
  variableTypeMap.set(statement.name, actualType);
  return ok(valueResult.value.resultRegister + 1);
}

function compileBlockWithContext(
  expr: Expression & { type: "block" },
  nextRegister: number,
  parentVariableMap: Map<string, number>,
  parentVariableTypeMap?: Map<string, string>,
): Result<
  { instructions: Instruction[]; resultRegister: number },
  CompileError
> {
  const instructions: Instruction[] = [];
  let currentRegister = nextRegister;
  const variableMap = new Map(parentVariableMap);
  const variableTypeMap = new Map(parentVariableTypeMap || []);

  for (const statement of expr.statements) {
    const processResult = processBlockStatement(
      statement,
      instructions,
      currentRegister,
      variableMap,
      variableTypeMap,
    );
    if (!processResult.ok) return processResult;
    currentRegister = processResult.value;
  }

  const resultCompile = compileExpressionWithContext(
    expr.result,
    currentRegister,
    variableMap,
    variableTypeMap,
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
