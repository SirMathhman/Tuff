import {
  extractIdentifier,
  isDeclarationStart,
  skipSpace,
} from "./string-utils.js";
import { isSpace, isDigit, isDigitOrDot, isAlphaNum } from "./char-utils.js";

/** Find the `=` after skipping a balanced delimited block, return rhs. */
function skipBlockToEquals(
  t: string,
  start: number,
  open: string,
  close: string,
): string | null {
  let depth = 1,
    end = start + 1;
  while (end < t.length && depth > 0) {
    if (t[end] === open) depth++;
    else if (t[end] === close) depth--;
    end++;
  }
  const p = skipSpace(t, end);
  if (p < t.length && t[p] === "=") return t.slice(p + 1).trim();
  return null;
}

/** Parse declaration with types, pointers, aliases, refinements. */
export function parseDeclaration(
  input: string,
): { name: string; typeAnnot?: string; rhs: string } | null {
  const trimmed = input.trim();
  if (!isDeclarationStart(trimmed)) return null;

  // Skip the declaration keyword (let/const/var)
  let pos = skipSpace(trimmed);
  const kw = extractIdentifier(trimmed.slice(pos));
  pos += kw.length;
  pos = skipSpace(trimmed, pos);

  // Check for mut
  if (trimmed.startsWith("mut", pos)) {
    const afterMut = pos + 3;
    if (afterMut >= trimmed.length || isSpace(trimmed[afterMut]!)) {
      pos = skipSpace(trimmed, afterMut);
    }
  }

  // Extract variable name
  const name = extractIdentifier(trimmed.slice(pos));
  if (!name) return null;
  pos += name.length;
  pos = skipSpace(trimmed, pos);

  // Check for type annotation (colon)
  if (pos < trimmed.length && trimmed[pos] === ":") {
    pos++; // skip colon
    pos = skipSpace(trimmed, pos);

    // Check for pointer prefix
    let pointerPrefix = "";
    if (pos < trimmed.length && trimmed[pos] === "*") {
      pointerPrefix = "*";
      pos++;
      pos = skipSpace(trimmed, pos);
    }

    // Check for refinement value type (e.g., 5U8)
    if (
      pos < trimmed.length &&
      (isDigit(trimmed[pos]!) ||
        (trimmed[pos] === "-" &&
          pos + 1 < trimmed.length &&
          isDigit(trimmed[pos + 1]!)))
    ) {
      let numStr = "";
      if (trimmed[pos] === "-") {
        numStr += "-";
        pos++;
      }
      while (pos < trimmed.length && isDigitOrDot(trimmed[pos]!)) {
        numStr += trimmed[pos];
        pos++;
      }
      let suffix = "";
      while (pos < trimmed.length && isAlphaNum(trimmed[pos]!)) {
        suffix += trimmed[pos];
        pos++;
      }
      pos = skipSpace(trimmed, pos);
      if (pos < trimmed.length && trimmed[pos] === "=") {
        const rhs = trimmed.slice(pos + 1).trim();
        return { name, typeAnnot: numStr + suffix, rhs };
      }
      return null;
    }

    // Check for tuple type: (I32, I32)
    if (pos < trimmed.length && trimmed[pos] === "(") {
      const rhs = skipBlockToEquals(trimmed, pos, "(", ")");
      if (rhs !== null) return { name, typeAnnot: "tuple", rhs };
      return null;
    }

    // Check for struct type: { x : I32, y : I32 }
    if (pos < trimmed.length && trimmed[pos] === "{") {
      const rhs = skipBlockToEquals(trimmed, pos, "{", "}");
      if (rhs !== null) return { name, typeAnnot: undefined, rhs };
      return null;
    }

    // Parse type name (e.g., U8, I32, Temp<I32>)
    let typeName = extractIdentifier(trimmed.slice(pos));
    if (!typeName) return null;
    pos += typeName.length;

    // Parse generic params <...>
    if (pos < trimmed.length && trimmed[pos] === "<") {
      let depth = 1;
      let end = pos + 1;
      while (end < trimmed.length && depth > 0) {
        if (trimmed[end] === "<") depth++;
        else if (trimmed[end] === ">") depth--;
        end++;
      }
      typeName += trimmed.slice(pos, end);
      pos = end;
    }

    pos = skipSpace(trimmed, pos);

    // Parse refinement chain (!= N && != M ...)
    let refinementChain = "";
    if (
      pos < trimmed.length &&
      trimmed[pos] === "!" &&
      pos + 1 < trimmed.length &&
      trimmed[pos + 1] === "="
    ) {
      const refineStart = pos;
      while (pos < trimmed.length) {
        pos = skipSpace(trimmed, pos);
        if (
          pos < trimmed.length &&
          trimmed[pos] === "!" &&
          pos + 1 < trimmed.length &&
          trimmed[pos + 1] === "="
        ) {
          pos += 2; // skip !=
          pos = skipSpace(trimmed, pos);
          // Parse number (optional minus)
          if (pos < trimmed.length && trimmed[pos] === "-") pos++;
          while (pos < trimmed.length && isDigitOrDot(trimmed[pos]!)) pos++;
          pos = skipSpace(trimmed, pos);
          // Check for &&
          if (
            pos < trimmed.length &&
            trimmed[pos] === "&" &&
            pos + 1 < trimmed.length &&
            trimmed[pos + 1] === "&"
          ) {
            pos += 2;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      refinementChain = trimmed.slice(refineStart, pos).trim();
    }

    pos = skipSpace(trimmed, pos);
    if (pos < trimmed.length && trimmed[pos] === "=") {
      const rhs = trimmed.slice(pos + 1).trim();
      const typeAnnot =
        pointerPrefix +
        typeName +
        (refinementChain ? " " + refinementChain : "");
      return { name, typeAnnot, rhs };
    }

    return null;
  }

  // Simple declaration: let x = value
  if (pos < trimmed.length && trimmed[pos] === "=") {
    const rhs = trimmed.slice(pos + 1).trim();
    return { name, typeAnnot: undefined, rhs };
  }

  return null;
}
