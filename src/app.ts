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

function parseNumberWithSuffix(source: string): number | undefined {
  let numStr = source;

  // Check for type suffix (capital letter followed by digits)
  for (let i = source.length - 1; i >= 0; i--) {
    const char = source[i];
    if (char && char >= "0" && char <= "9") continue;
    if (char && char >= "A" && char <= "Z") {
      numStr = source.substring(0, i);
    }
    break;
  }

  // Validate the number part contains only digits and optional minus sign
  let isValidNumber = numStr.length > 0;
  for (let i = 0; i < numStr.length; i++) {
    const char = numStr[i];
    if (i === 0 && char === "-") continue;
    if (char && char >= "0" && char <= "9") continue;
    isValidNumber = false;
    break;
  }

  if (isValidNumber) {
    const num = parseInt(numStr, 10);
    if (!isNaN(num)) {
      return num;
    }
  }
}

function parseReadInstruction(source: string): Instruction[] | undefined {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char !== " " && char !== "\t") {
      current += char;
      continue;
    }
    if (current.length > 0) {
      parts.push(current);
      current = "";
    }
  }
  if (current.length > 0) {
    parts.push(current);
  }

  if (parts.length !== 2 || parts[0] !== "read") {
    return undefined;
  }

  // Read from stdin into register 0, store in memory at 0, then halt
  return [
    {
      opcode: OpCode.In,
      variant: Variant.Immediate,
      operand1: 0,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 0,
      operand2: 0,
    },
    {
      opcode: OpCode.Halt,
      variant: Variant.Direct,
      operand1: 0,
    },
  ];
}

function buildAddInstructions(): Instruction[] {
  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 1,
      operand2: 1,
    },
    {
      opcode: OpCode.Add,
      variant: Variant.Immediate,
      operand1: 1,
      operand2: 0,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 1,
      operand2: 0,
    },
    {
      opcode: OpCode.Halt,
      variant: Variant.Direct,
      operand1: 0,
    },
  ];
}

function parseArithmeticExpression(source: string): Instruction[] | undefined {
  // Look for + operator
  let plusIndex = -1;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "+") {
      plusIndex = i;
      break;
    }
  }
  if (plusIndex === -1) return undefined;

  const leftPart = source.substring(0, plusIndex).trim();
  const rightPart = source.substring(plusIndex + 1).trim();

  // Parse left side (read U8)
  const leftInstructions = parseReadInstruction(leftPart);
  if (!leftInstructions) return undefined;

  // Parse right side (read U8)
  const rightInstructions = parseReadInstruction(rightPart);
  if (!rightInstructions) return undefined;

  // Build instruction sequence:
  // 1. Read first value into register 0, store at address 1
  // 2. Read second value into register 0
  // 3. Load value from address 1 into register 1
  // 4. Add register 1 and register 0, result in register 1
  // 5. Store result at address 0
  // 6. Halt with value from address 0
  return [
    {
      opcode: OpCode.In,
      variant: Variant.Immediate,
      operand1: 0,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 0,
      operand2: 1,
    },
    {
      opcode: OpCode.In,
      variant: Variant.Immediate,
      operand1: 0,
    },
    ...buildAddInstructions(),
  ];
}

export function compile(source: string): Result<Instruction[], CompileError> {
  // TODO, this will get rather complex!
  // This is the function you should probably implement

  const trimmed = source.trim();

  // Empty source: return empty instructions (implicit halt with 0)
  if (!trimmed) {
    return ok([]);
  }

  // Check for arithmetic expressions
  const arithResult = parseArithmeticExpression(trimmed);
  if (arithResult) {
    return ok(arithResult);
  }

  // Check for read instruction
  if (trimmed.startsWith("read")) {
    const readResult = parseReadInstruction(trimmed);
    if (readResult) {
      return ok(readResult);
    }
  }

  // Try to parse as a number with optional type suffix
  const num = parseNumberWithSuffix(trimmed);
  if (num !== undefined) {
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
