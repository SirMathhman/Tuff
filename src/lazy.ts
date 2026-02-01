import { Result, VariableScope } from "./types";

// Shared lazy loading for interpret and interpretStatementBlock
// to avoid circular dependencies
let interpretFn: ((input: string, scope: VariableScope | null) => Result<number | bigint, string>) | null = null;
let interpretStatementBlockFn: ((input: string, parentScope: VariableScope | null) => Result<number | bigint, string>) | null = null;

export function setInterpret(fn: (input: string, scope: VariableScope | null) => Result<number | bigint, string>): void {
  interpretFn = fn;
}

export function setInterpretStatementBlock(fn: (input: string, parentScope: VariableScope | null) => Result<number | bigint, string>): void {
  interpretStatementBlockFn = fn;
}

function initializeIfNeeded(): void {
  if (interpretFn === null || interpretStatementBlockFn === null) {
    // Use dynamic require to avoid circular dependencies at module load time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const coreMod = require("./core");
    interpretFn = coreMod.interpret;
    interpretStatementBlockFn = coreMod.interpretStatementBlock;
  }
}

export function getInterpret(): (input: string, scope: VariableScope | null) => Result<number | bigint, string> {
  initializeIfNeeded();
  return interpretFn as (input: string, scope: VariableScope | null) => Result<number | bigint, string>;
}

export function getInterpretStatementBlock(): (input: string, parentScope: VariableScope | null) => Result<number | bigint, string> {
  initializeIfNeeded();
  return interpretStatementBlockFn as (input: string, parentScope: VariableScope | null) => Result<number | bigint, string>;
}
