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
): Instruction {
  return { opcode, variant, operand1 };
}

export function compile(source: string): Result<Instruction[], CompileError> {
  // Check if this is a read command
  if (source.startsWith("read ")) {
    const typeStr = source.slice(5);
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

    // Compile to: In (read into register 0), Halt (with register 0)
    const instructions: Instruction[] = [
      createInstruction(OpCode.In, Variant.Immediate, 0),
      createInstruction(OpCode.Halt, Variant.Direct, 0),
    ];

    return ok(instructions);
  }

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
    createInstruction(OpCode.Halt, Variant.Immediate, valueResult.value),
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
