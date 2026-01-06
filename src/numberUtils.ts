import { Result, InterpretError, Value } from "./types";

export function requireNumber(
  value: Value,
  message: string
): Result<number, InterpretError> {
  if (typeof value !== "number") {
    return { ok: false, error: { type: "InvalidInput", message } };
  }
  return { ok: true, value };
}
