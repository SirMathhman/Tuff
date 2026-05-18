import { Err, type Result } from "./result";

export function compile(input: string): Result<string, Error> {
  void input;
  return new Err(new Error("Not implemented"));
}


