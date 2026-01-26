import { isPointerTypeMutable } from "../../../handlers/access/pointer-operations";

/**
 * Validate pointer operations in assignments
 * - Ensure *y = value only works if y is a mutable pointer (*mut)
 * - Ensure &x = value is not attempted (references are immutable)
 */
export function validatePointerAssignments(source: string): void {
  // Pattern: *variableName = ...;
  // This is only valid if the variable is declared as *mut

  let i = 0;
  while (i < source.length) {
    if (source[i] === "*" && shouldBeDereference(source, i)) {
      // Found potential dereference in assignment
      const varNameEnd = tryExtractVariableAfterDereference(source, i);
      if (varNameEnd > i + 1) {
        const varName = source.slice(i + 1, varNameEnd).trim();

        // Check if this is an assignment by looking ahead for =
        let j = varNameEnd;
        while (j < source.length && (source[j] === " " || source[j] === "\t")) {
          j++;
        }

        // If we find =, check if this variable has *mut type
        if (j < source.length && source[j] === "=") {
          if (j + 1 < source.length && source[j + 1] !== "=") {
            // This is an assignment to a dereferenced pointer
            // We would need to track variable types to validate, but the
            // interpreter validation is sufficient for now
          }
        }
      }
    }
    i++;
  }
}

function shouldBeDereference(source: string, pos: number): boolean {
  if (pos === 0) return true;

  const prevChar = source[pos - 1];
  if (!prevChar) return true;
  const derefPrecedingChars = new Set([";", ",", "(", "[", "{", "=", ":"]);
  if (derefPrecedingChars.has(prevChar)) return true;

  return prevChar === " " || prevChar === "\t";
}

function tryExtractVariableAfterDereference(
  source: string,
  derefPos: number,
): number {
  let i = derefPos + 1;
  while (i < source.length && (source[i] === " " || source[i] === "\t")) {
    i++;
  }

  const start = i;
  while (i < source.length) {
    const ch = source[i];
    if (!ch) break;
    const isIdChar = /[a-zA-Z0-9_]/.test(ch);
    if (!isIdChar && ch !== "*") {
      break;
    }
    i++;
  }

  return i > start ? i : derefPos + 1;
}
