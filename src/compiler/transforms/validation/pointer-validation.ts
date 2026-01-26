import { extractTypeSize } from "../../../type-utils";

export interface VariableInfo {
  type: string | undefined;
  mutable: boolean;
  initialized: boolean;
  isArray?: boolean;
}

/**
 * Validate pointer operations at compile time
 * - Ensure pointer type assignments match variable types
 * - Ensure *mut pointers are only created from mutable variables
 */
export function validatePointerOperations(
  source: string,
  variables: Map<string, VariableInfo>,
): void {
  let i = 0;
  while (i < source.length) {
    // Look for let declarations with pointer types
    if (source[i] === "l" && source.slice(i, i + 4) === "let ") {
      const colonIdx = source.indexOf(":", i);
      const eqIdx = source.indexOf("=", i);
      const semiIdx = source.indexOf(";", i);

      if (colonIdx !== -1 && colonIdx < (eqIdx || semiIdx || source.length)) {
        const typeStart = colonIdx + 1;
        const typeEnd =
          eqIdx !== -1 ? eqIdx : semiIdx !== -1 ? semiIdx : source.length;
        const typeStr = source.slice(typeStart, typeEnd).trim();

        // If this is a pointer type
        if (typeStr.startsWith("*")) {
          // Check if there's an initializer
          if (eqIdx !== -1) {
            const exprStart = eqIdx + 1;
            const exprEnd = semiIdx !== -1 ? semiIdx : source.length;
            const exprStr = source.slice(exprStart, exprEnd).trim();

            // Pointer types require & operator (reference) or existing pointer
            if (exprStr.startsWith("&")) {
              // This is a reference operation - validate it
              const refTarget = tryExtractVarFromReference(exprStr);
              if (refTarget) {
                // Validate variable exists and matches type
                const baseType = typeStr.startsWith("*mut ")
                  ? typeStr.slice(5).trim()
                  : typeStr.slice(1).trim();

                const varInfo = variables.get(refTarget);
                if (!varInfo) {
                  // Variable doesn't exist - will be caught by other validation
                } else {
                  // Check type compatibility
                  const expectedTypeSize = extractTypeSize(baseType);
                  const actualTypeSize = varInfo.type
                    ? extractTypeSize(varInfo.type)
                    : 0;
                  if (
                    expectedTypeSize !== 0 &&
                    actualTypeSize !== 0 &&
                    expectedTypeSize !== actualTypeSize
                  ) {
                    throw new Error(
                      `type mismatch: cannot create pointer to '${refTarget}' of type ${varInfo.type}, expected ${baseType}`,
                    );
                  }

                  // Check mutability for *mut
                  if (typeStr.startsWith("*mut ") && !varInfo.mutable) {
                    throw new Error(
                      `cannot create mutable pointer to immutable variable '${refTarget}'`,
                    );
                  }
                }
              }
            }
          }
        }
      }

      i = semiIdx !== -1 ? semiIdx + 1 : source.length;
    } else {
      i++;
    }
  }
}

function tryExtractVarFromReference(exprStr: string): string | undefined {
  if (!exprStr.startsWith("&")) return undefined;
  const afterAnd = exprStr.slice(1).trim();

  // Extract identifier after &
  let i = 0;
  while (i < afterAnd.length) {
    const ch = afterAnd[i];
    if (!ch || !/[a-zA-Z0-9_]/.test(ch)) break;
    i++;
  }

  if (i > 0) {
    return afterAnd.slice(0, i);
  }
  return undefined;
}
