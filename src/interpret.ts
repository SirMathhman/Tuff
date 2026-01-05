import { Result, ok, err } from "./result";

export function interpret(input: string): Result<number, string> {
  const trimmed = input.trim();
  const n = Number(trimmed);
  if (Number.isFinite(n)) {
    return ok(n);
  }
  return err("Err");
}
