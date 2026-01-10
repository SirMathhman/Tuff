import { Result, Ok, Err } from "./result.js";

export function interpret(input: string): Result<number, string> {
  // Check for negative numbers with type suffixes
  if (/^-.*[A-Z]\d+$/.test(input)) {
    return Err("Invalid literal: negative numbers cannot have type suffixes");
  }

  // Remove type suffixes (e.g., U8, I32, etc.)
  const stripped = input.replace(/[A-Z]\d+$/, "");
  return Ok(parseInt(stripped, 10));
}
