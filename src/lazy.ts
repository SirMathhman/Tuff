import { Result, VariableScope } from "./types";

// Shared lazy loading for interpret and interpretStatementBlock
// to avoid circular dependencies
let interpretFn: ((input: string, scope: VariableScope | null) => Result<number | bigint, string>) | null = null;
let interpretStatementBlockFn: ((input: string, parentScope: VariableScope | null) => Result<number | bigint, string>) | null = null;

export function getInterpret(): (input: string, scope: VariableScope | null) => Result<number | bigint, string> {
  if (!interpretFn) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const index = require("./index");
    interpretFn = index.interpret;
  }
  return interpretFn as (input: string, scope: VariableScope | null) => Result<number | bigint, string>;
}

export function getInterpretStatementBlock(): (input: string, parentScope: VariableScope | null) => Result<number | bigint, string> {
  if (!interpretStatementBlockFn) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const index = require("./index");
    interpretStatementBlockFn = index.interpretStatementBlock;
  }
  return interpretStatementBlockFn as (input: string, parentScope: VariableScope | null) => Result<number | bigint, string>;
}
