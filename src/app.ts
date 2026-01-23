import { execute, type Instruction, OpCode, Variant } from "./core/vm";
import { type Dump, type ExecutionState } from "./core/debug-dump";
import { type CompileError } from "./types/types";

export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<X> {
  ok: false;
  error: X;
}

export type Result<T, X> = Ok<T> | Err<X>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<X>(error: X): Err<X> {
  return { ok: false, error };
}

function createCompileError(
  cause: string,
  reason: string,
  fix: string,
  length: number,
): CompileError {
  return {
    cause,
    reason,
    fix,
    first: { line: 1, column: 1, length },
  };
}

type SuffixInfo = { suffix: string; minVal: number; maxVal: number } | null;

function createSignedBoundary(bits: number): {
  minVal: number;
  maxVal: number;
} {
  const minVal = -(2 ** (bits - 1));
  const maxVal = 2 ** (bits - 1) - 1;
  return { minVal, maxVal };
}

function createUnsignedBoundary(bits: number): {
  minVal: number;
  maxVal: number;
} {
  const minVal = 0;
  const maxVal = 2 ** bits - 1;
  return { minVal, maxVal };
}

function getSuffixInfo(source: string): SuffixInfo {
  const suffixMap: Record<string, { minVal: number; maxVal: number }> = {
    I64: createSignedBoundary(64),
    I32: createSignedBoundary(32),
    I16: createSignedBoundary(16),
    I8: createSignedBoundary(8),
    U64: createUnsignedBoundary(64),
    U32: createUnsignedBoundary(32),
    U16: createUnsignedBoundary(16),
    U8: createUnsignedBoundary(8),
  };

  for (const [suffix, limits] of Object.entries(suffixMap)) {
    if (source.endsWith(suffix)) {
      return { suffix, ...limits };
    }
  }

  return null;
}

function parseNumericLiteral(source: string): Result<number, CompileError> {
  const suffixInfo = getSuffixInfo(source);
  const numStr = suffixInfo
    ? source.slice(0, -suffixInfo.suffix.length)
    : source;
  const value = parseInt(numStr, 10);

  if (isNaN(value)) {
    const cause = suffixInfo
      ? `Invalid ${suffixInfo.suffix} literal`
      : "Invalid input";
    const reason = suffixInfo
      ? `${suffixInfo.suffix} suffix requires a valid integer before it`
      : "Input must be a valid integer or empty";
    const fix = suffixInfo
      ? `Use format like '100${suffixInfo.suffix}'`
      : "Provide a valid integer like '100' or leave empty";
    return err(createCompileError(cause, reason, fix, source.length));
  }

  if (suffixInfo && (value < suffixInfo.minVal || value > suffixInfo.maxVal)) {
    return err(
      createCompileError(
        `Invalid ${suffixInfo.suffix} literal`,
        `${suffixInfo.suffix} literals must be in range ${suffixInfo.minVal}-${suffixInfo.maxVal}, got ${value}`,
        `Use a value between ${suffixInfo.minVal} and ${suffixInfo.maxVal} for ${suffixInfo.suffix} suffix`,
        source.length,
      ),
    );
  }

  return ok(value);
}

function createInstruction(
  opcode: OpCode,
  variant: Variant,
  operand1: number,
  operand2?: number,
): Instruction {
  return { opcode, variant, operand1, operand2 };
}

type Expression =
  | { type: "literal"; value: number }
  | { type: "read"; typeStr: string }
  | {
      type: "binary";
      op: "+" | "-" | "*" | "/";
      left: Expression;
      right: Expression;
    };

type BinaryOp = "+" | "-" | "*" | "/";
type ParserFunction = (source: string) => Result<Expression, CompileError>;

function parseBinaryExpression(
  source: string,
  operators: BinaryOp[],
  nextParser: ParserFunction,
): Result<Expression, CompileError> {
  // Find the rightmost operator at depth 0 (not inside parentheses or braces)
  let operatorIndex = -1;
  let operator: BinaryOp | undefined;
  let parenDepth = 0;
  let braceDepth = 0;

  for (let i = source.length - 1; i >= 0; i--) {
    const char = source[i];

    if (char === ")") {
      parenDepth++;
    } else if (char === "(") {
      parenDepth--;
    } else if (char === "}") {
      braceDepth++;
    } else if (char === "{") {
      braceDepth--;
    } else if (
      parenDepth === 0 &&
      braceDepth === 0 &&
      operators.includes(char as BinaryOp)
    ) {
      operatorIndex = i;
      operator = char as BinaryOp;
      break;
    }
  }

  if (operatorIndex > 0 && operator) {
    const left = source.slice(0, operatorIndex).trim();
    const right = source.slice(operatorIndex + 1).trim();

    const leftResult = parseBinaryExpression(left, operators, nextParser);
    const rightResult = nextParser(right);

    if (!leftResult.ok) return leftResult;
    if (!rightResult.ok) return rightResult;

    return ok({
      type: "binary",
      op: operator,
      left: leftResult.value,
      right: rightResult.value,
    });
  }

  return nextParser(source);
}

function parseExpression(source: string): Result<Expression, CompileError> {
  // Handle empty input as literal 0
  if (source === "") {
    return ok({ type: "literal", value: 0 });
  }

  // Try to parse as addition/subtraction (lowest precedence)
  return parseAdditionSubtraction(source);
}

function parseAdditionSubtraction(
  source: string,
): Result<Expression, CompileError> {
  return parseBinaryExpression(source, ["+", "-"], parseMultiplicationDivision);
}

function parseMultiplicationDivision(
  source: string,
): Result<Expression, CompileError> {
  return parseBinaryExpression(source, ["*", "/"], parsePrimary);
}

function checkBracketPairing(
  source: string,
  openChar: string,
  closeChar: string,
): boolean {
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === openChar) depth++;
    if (source[i] === closeChar) depth--;
    if (depth === 0 && i < source.length - 1) {
      return false;
    }
  }
  return depth === 0;
}

function isFullyWrappedInBrackets(
  source: string,
): { type: "paren" | "brace" } | null {
  const bracketPairs: Array<{ open: string; close: string; type: "paren" | "brace" }> = [
    { open: "(", close: ")", type: "paren" },
    { open: "{", close: "}", type: "brace" },
  ];

  for (const pair of bracketPairs) {
    const isWrapped = source.startsWith(pair.open) && source.endsWith(pair.close) && checkBracketPairing(source, pair.open, pair.close);
    if (isWrapped) {
      return { type: pair.type };
    }
  }

  return null;
}

function parsePrimary(source: string): Result<Expression, CompileError> {
  // Check if it's a parenthesized or braced expression
  const bracketInfo = isFullyWrappedInBrackets(source);
  if (bracketInfo) {
    const inner = source.slice(1, -1).trim();
    return parseExpression(inner);
  }

  // Check if it's a read command
  if (source.startsWith("read ")) {
    const typeStr = source.slice(5).trim();
    const suffixInfo = getSuffixInfo(typeStr);

    if (!suffixInfo) {
      return err(
        createCompileError(
          "Invalid read command",
          `Unknown integer type: ${typeStr}`,
          "Use format like 'read U8', 'read I32', etc.",
          source.length,
        ),
      );
    }

    return ok({ type: "read", typeStr });
  }

  // Try to parse as a numeric literal
  const numResult = parseNumericLiteral(source);
  if (!numResult.ok) return numResult;

  return ok({ type: "literal", value: numResult.value });
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

function compileBinary(
  expr: Expression & { type: "binary" },
  nextRegister: number,
): Result<
  { instructions: Instruction[]; resultRegister: number },
  CompileError
> {
  // Compile left side first (left-to-right evaluation order)
  const leftResult = compileExpression(expr.left, nextRegister);
  if (!leftResult.ok) return leftResult;

  // Then compile right side
  const rightResult = compileExpression(
    expr.right,
    leftResult.value.resultRegister + 1,
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

function compileExpression(
  expr: Expression,
  nextRegister: number,
): Result<
  { instructions: Instruction[]; resultRegister: number },
  CompileError
> {
  if (expr.type === "literal") {
    return compileLiteral(expr, nextRegister);
  }

  if (expr.type === "read") {
    return compileRead(nextRegister);
  }

  return compileBinary(expr, nextRegister);
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
