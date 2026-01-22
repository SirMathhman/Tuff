import { execute, type Instruction, OpCode, Variant } from "./vm";

export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<X> {
  ok: false;
  error: X;
}

export type Result<T, X> = Ok<T> | Err<X>;

export interface Error {
  // What went wrong
  cause: string;

  // Why it went wrong
  reason: string;

  // How to fix it
  fix: string;
}

export interface Location {
  line: number;
  column: number;
  length: number;
}

export interface CompileError extends Error {
  first: Location;

  // Sometimes, we might have two different places that conflict with each other
  second?: Location;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<X>(error: X): Err<X> {
  return { ok: false, error };
}

export function compile(source: string): Result<Instruction[], CompileError> {
  // TODO, this will get rather complex!
  // This is the function you should probably implement

  const trimmed = source.trim();

  // Empty source: return empty instructions (implicit halt with 0)
  if (!trimmed) {
    return ok([]);
  }

  // Try to parse as a number
  const num = parseInt(trimmed, 10);
  if (!isNaN(num)) {
    // Create a halt instruction with the number as immediate value
    return ok([
      {
        opcode: OpCode.Halt,
        variant: Variant.Immediate,
        operand1: num,
      },
    ]);
  }

  return ok([]);
}

export function run(
  source: string,
  stdIn: number[] = [],
): Result<number, Error> {
  const instructions = compile(source);
  if (!instructions.ok) {
    return err(instructions.error);
  }

  return ok(
    execute(
      instructions.value,
      () => {
        // Read from stdIn
        return stdIn.shift() ?? 0;
      },
      (value: number) => {
        // Write to stdout
        console.log("Output:", value);
      },
    ),
  );
}
