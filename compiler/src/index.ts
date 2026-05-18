import { Err, Ok, type Result } from "./result";

const RETURN = "return ";

export enum CompileError {
  NotImplemented,
}

export function compile(input: string): Result<string, CompileError> {
  const trimmed = input.trim();
  if (trimmed === "") {
    return new Ok(RETURN + "0");
  }
  if (trimmed === "read<U8>()") {
    return new Ok(RETURN + "Number(stdIn)");
  }
  return new Err(CompileError.NotImplemented);
}
