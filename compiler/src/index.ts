import { Err, Ok, type Result } from "./result";

export function compile(input: string): Result<string, Error> {
  if (input.trim() === "") {
    return new Ok("return 0");
  }
  return new Err(new Error("Not implemented"));
}
