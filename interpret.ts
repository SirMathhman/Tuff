import { Result, Ok, Err } from "./result.js";

export function interpret(input: string): Result<number, string> {
  // Check for negative numbers with type suffixes
  if (/^-.*[A-Z]\d+$/.test(input)) {
    return Err("Invalid literal: negative numbers cannot have type suffixes");
  }

  // Extract type suffix if present
  const typeMatch = input.match(/([A-Z]\d+)$/);
  const typePrefix = typeMatch ? typeMatch[1] : null;

  // Remove type suffixes (e.g., U8, I32, etc.)
  const stripped = input.replace(/[A-Z]\d+$/, "");
  const num = parseInt(stripped, 10);

  // Validate against type constraints
  if (typePrefix === "U8" && (num < 0 || num > 255)) {
    return Err(`Invalid literal: value ${num} is out of range for U8 (0-255)`);
  }

  return Ok(num);
}
