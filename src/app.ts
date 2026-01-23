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

function parseNumericLiteral(source: string): Result<number, CompileError> {
  // Check for U8 suffix
  const hasU8Suffix = source.endsWith("U8");
  const isU8Parse = hasU8Suffix;
  const numStr = hasU8Suffix ? source.slice(0, -2) : source;
  const value = parseInt(numStr, 10);

  if (isNaN(value)) {
    const cause = isU8Parse ? "Invalid U8 literal" : "Invalid input";
    const reason = isU8Parse
      ? "U8 suffix requires a valid integer before it"
      : "Input must be a valid integer or empty";
    const fix = isU8Parse
      ? "Use format like '100U8'"
      : "Provide a valid integer like '100' or leave empty";
    return err(createCompileError(cause, reason, fix, source.length));
  }

  // U8 must be non-negative and fit in 0-255 range
  if (isU8Parse && (value < 0 || value > 255)) {
    return err(
      createCompileError(
        "Invalid U8 literal",
        `U8 literals must be in range 0-255, got ${value}`,
        "Use a value between 0 and 255 for U8 suffix",
        source.length,
      ),
    );
  }

  return ok(value);
}

export function compile(source: string): Result<Instruction[], CompileError> {
  let valueResult: Result<number, CompileError>;

  if (source === "") {
    valueResult = ok(0);
  } else {
    valueResult = parseNumericLiteral(source);
  }

  if (!valueResult.ok) {
    return valueResult;
  }

  // Generate instructions to halt with the value as exit code
  const instructions: Instruction[] = [
    {
      opcode: OpCode.Halt,
      variant: Variant.Immediate,
      operand1: valueResult.value,
    },
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
