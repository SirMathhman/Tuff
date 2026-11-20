import { type Problem } from "./lexing";
import { type Cursor } from "../types";

/**
 * Declares the functions directly inside the block that starts at the cursor, before any of its
 * statements run, so a call may come before the function's declaration. Scanning stops at the
 * block's closing brace. Problems are ignored here; the ordinary parse reports them.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position at the first statement of the block. Its scope receives the functions.
 * @param declareFunction - Parses one function declaration from the cursor it is given.
 */
export function hoistFunctions(
  text: string,
  cursor: Cursor,
  declareFunction: (text: string, cursor: Cursor) => Problem | undefined,
): void {
  let depth = 0;
  for (let pos = cursor.pos; pos < text.length; pos++) {
    const char = text.charAt(pos);
    if (char === "(" || char === "{") {
      depth++;
    } else if (char === ")" || char === "}") {
      depth--;
      if (depth < 0) {
        return;
      }
    } else if (depth === 0 && isFunctionKeyword(text, pos)) {
      declareFunction(text, { ...cursor, pos });
    }
  }
}

/**
 * Reports whether the word "fn" starts at the given offset, as a whole word followed by whitespace.
 *
 * @param text - The source being parsed.
 * @param pos - The offset to check.
 * @returns True if "fn" starts a function declaration at this offset.
 */
function isFunctionKeyword(text: string, pos: number): boolean {
  const before = text.charAt(pos - 1);
  return text.startsWith("fn", pos) && !/[A-Za-z0-9_]/.test(before) && /\s/.test(text.charAt(pos + 2));
}
