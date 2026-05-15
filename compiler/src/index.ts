import type { Result } from "./result";
import { Ok, Err } from "./result";

export { Ok };

function isDigit(ch: string | undefined): boolean {
  if (!ch) return false;
  return ch >= "0" && ch <= "9";
}

function isSpace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t";
}

// Advances `i` past all space characters in `str`, returning the new index.
function skipSpaces(str: string, i: number): number {
  while (i < str.length && str[i] === " ") i++;
  return i;
}

// Advances `pos` past all alphanumeric characters in `s`, returning the new position.
function identEnd(s: string, pos: number): number {
  while (pos < s.length) {
    const ch = s[pos];
    if (!ch) break;
    if (ch >= "a" && ch <= "z") {
      pos++;
      continue;
    }
    if (ch >= "A" && ch <= "Z") {
      pos++;
      continue;
    }
    if (isDigit(ch)) {
      pos++;
      continue;
    }
    break;
  }
  return pos;
}

function trim(s: string): string {
  let start = 0;
  while (start < s.length && isSpace(s[start])) start++;
  let end = s.length;
  while (end > start && isSpace(s[end - 1])) end--;
  return s.slice(start, end);
}

// Returns the integer parsed from `s`, or 8 if the parse fails.
function parseWidthOr8(s: string): number {
  const n = parseInt(s, 10);
  return isNaN(n) ? 8 : n;
}

export function compile(tuffSourceCode: string): Result<string, string> {
  if (tuffSourceCode === "") {
    return new Ok("return 0;");
  }

  // First pass: collect variable types, mutability, and check for type mismatches.
  const rawParts = tuffSourceCode.split(";");
  const varTypes: Record<string, number> = {};
  const mutableVars: Set<string> = new Set();

  for (let p = 0; p < rawParts.length - 1; p++) {
    const part = trim(rawParts[p] ?? "");
    if (!part) continue;

    // Check if this is a `let` declaration.
    if (part.startsWith("let ")) {
      let afterLet: string;
      const restAfterLet = part.slice(4);
      const trimmedRest = restAfterLet.trim();

      // Handle `let mut x` vs `let x`.
      if (trimmedRest.startsWith("mut ")) {
        const afterMut = trimmedRest.slice(4);
        const varNameFromMutEnd = identEnd(afterMut, 0);
        mutableVars.add(afterMut.slice(0, varNameFromMutEnd));
        afterLet = part.slice(8); // skip "let mut"
      } else {
        afterLet = restAfterLet;
      }

      let pos = skipSpaces(afterLet, identEnd(afterLet, 0));
      const varName = afterLet
        .slice(0, pos - (afterLet[pos - 1] === " " ? 1 : 0))
        .trim();

      // Determine declared type width. If no explicit annotation, infer from literal.
      let hasExplicitType = false;
      let declaredTypeNum = 8;

      if (pos < afterLet.length && afterLet[pos] === ":") {
        hasExplicitType = true;
        pos = skipSpaces(afterLet, pos + 1);
        const typeStart = pos;
        pos = identEnd(afterLet, pos);
        let numStr = "";
        const typeText = afterLet.slice(typeStart, pos);
        for (let ci = 0; ci < typeText.length; ci++) {
          const c = typeText[ci];
          if (isDigit(c)) numStr += c;
        }
        declaredTypeNum = parseWidthOr8(numStr);
      }

      // Find the RHS and determine its value type.
      let rhsValueNum = 8;
      const eqIdx = afterLet.indexOf("=");
      if (eqIdx >= 0) {
        const rhs = trim(afterLet.slice(eqIdx + 1));

        // Check if RHS is a variable reference.
        const rhsIdentEnd = identEnd(rhs, 0);
        const rhsVarName = rhs.slice(0, rhsIdentEnd).trim();
        if (rhsVarName in varTypes) {
          rhsValueNum = varTypes[rhsVarName]!;
        } else {
          // Determine the type width of a literal on the RHS.
          let si = rhs.length;
          while (si > 0 && isDigit(rhs[si - 1])) si--;
          const uIdx = si - 1;
          const uCh = rhs[uIdx];
          if (uIdx >= 0 && uCh === "U" && uIdx > 0 && isDigit(rhs[uIdx - 1])) {
            // Verify no `<` precedes the digits before U.
            if (rhs.slice(0, uIdx - 1).indexOf("<") < 0) {
              const suffixStr = rhs.slice(si);
              if (suffixStr.length > 0) rhsValueNum = parseWidthOr8(suffixStr);
            }
          }
        }

        if (rhsValueNum > declaredTypeNum) {
          return new Err(
            "Value type U" +
              rhsValueNum +
              " does not fit in variable type U" +
              declaredTypeNum,
          );
        }
      }

      // Store the variable's effective type.
      varTypes[varName] = hasExplicitType ? declaredTypeNum : rhsValueNum;
    } else {
      // Check for assignment to a non-mutable variable: `x = ...`
      const eqIdx = part.indexOf("=");
      if (eqIdx > 0) {
        const lhsVarName = trim(part.slice(0, eqIdx));
        if (lhsVarName in varTypes && !mutableVars.has(lhsVarName)) {
          return new Err("Cannot assign to immutable variable: " + lhsVarName);
        }
      }
    }
  }
  const prefix = "read<U";
  const suffix = ">()";
  let transformed = "";
  let ti = 0;
  const srcLen = tuffSourceCode.length;

  while (ti < srcLen) {
    const ch = tuffSourceCode[ti];

    // Handle `read<U8>()` -> `read()`.
    if (ch === "r") {
      const prefixEnd = ti + prefix.length;
      if (tuffSourceCode.slice(ti, prefixEnd) === prefix) {
        let tj = prefixEnd;
        while (tj < srcLen && isDigit(tuffSourceCode[tj])) tj++;
        const suffixEnd = tj + suffix.length;
        if (tuffSourceCode.slice(tj, suffixEnd) === suffix) {
          transformed += "read()";
          ti = suffixEnd;
          continue;
        }
      }
    }

    // Handle type annotations `: U8` -> strip them.
    if (ch === ":" && tuffSourceCode[ti + 1] === " ") {
      ti = identEnd(tuffSourceCode, ti + 2);
      continue;
    }

    // Handle block expressions `{ ... }` -> just the content.
    if (ch === "{") {
      let depth = 1;
      const innerStart = ti + 1;
      ti++;
      while (ti < srcLen && depth > 0) {
        if (tuffSourceCode[ti] === "{") depth++;
        else if (tuffSourceCode[ti] === "}") depth--;
        ti++;
      }
      transformed += tuffSourceCode.slice(innerStart, ti - 1).trim();
      continue;
    }

    // Handle numeric literals with U suffix: `100U8` -> `100`.
    if (isDigit(ch)) {
      let numEnd = ti + 1;
      while (numEnd < srcLen && isDigit(tuffSourceCode[numEnd])) numEnd++;
      transformed += tuffSourceCode.slice(ti, numEnd);
      // Skip the U suffix and any following digits.
      if (tuffSourceCode[numEnd] === "U") {
        ti = identEnd(tuffSourceCode, numEnd + 1);
      } else {
        ti = numEnd;
      }
      continue;
    }

    transformed += ch;
    ti++;
  }

  // Build the function body from statements, checking for duplicate `let` names.
  const parts = transformed.split(";");
  const partsEnd = parts.length - 1;
  let body = "";
  const declaredVars: string[] = [];
  for (let p = 0; p < partsEnd; p++) {
    const stmt = trim(parts[p] ?? "");
    if (stmt === "") continue;

    if (stmt.startsWith("let ")) {
      const letRest = stmt.slice(4);
      const nameLen = identEnd(letRest, 0);
      const varName = letRest.slice(0, nameLen);
      for (let i = 0; i < declaredVars.length; i++) {
        if (declaredVars[i] === varName) {
          return new Err("Duplicate variable declaration: " + varName);
        }
      }
      declaredVars.push(varName);
    }
    body += stmt + ";\n";
  }

  const lastExpr = trim(parts[partsEnd] ?? "");

  return new Ok(
    'const inputs = stdIn.split(" ").map(Number);\nlet idx = 0;\nfunction read() { return inputs[idx++]; }\n' +
      body +
      "return " +
      lastExpr +
      ";",
  );
}
