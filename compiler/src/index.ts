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

  // Check for type mismatches: `let x : U8 = 0U16` etc.
  const rawParts = tuffSourceCode.split(";");
  for (let p = 0; p < rawParts.length - 1; p++) {
    const part = trim(rawParts[p] ?? "");
    if (!part || !part.startsWith("let ")) continue;

    const afterLet = part.slice(4);
    let pos = skipSpaces(afterLet, identEnd(afterLet, 0));
    if (afterLet[pos] !== ":") continue;

    pos = skipSpaces(afterLet, pos + 1);
    const typeStart = pos;
    pos = identEnd(afterLet, pos);

    let numStr = "";
    const typeText = afterLet.slice(typeStart, pos);
    for (let ci = 0; ci < typeText.length; ci++) {
      const c = typeText[ci];
      if (isDigit(c)) numStr += c;
    }
    const declaredTypeNum = parseWidthOr8(numStr);

    const eqIdx = afterLet.indexOf("=", pos);
    if (eqIdx < 0) continue;

    // Determine the type width of the literal on the RHS (e.g. `0U16` -> 16).
    const rhs = trim(afterLet.slice(eqIdx + 1));
    // Scan backward past trailing digits to find a potential `U<n>` suffix.
    let si = rhs.length;
    while (si > 0 && isDigit(rhs[si - 1])) si--;
    const uIdx = si - 1;
    const uCh = rhs[uIdx];
    let literalTypeNum = 8;
    if (uIdx >= 0 && uCh === "U" && uIdx > 0 && isDigit(rhs[uIdx - 1])) {
      // Verify no `<` precedes the digits before U (rules out `read<U8>` style).
      if (rhs.slice(0, uIdx - 1).indexOf("<") < 0) {
        const suffixStr = rhs.slice(si);
        if (suffixStr.length > 0) literalTypeNum = parseWidthOr8(suffixStr);
      }
    }

    if (literalTypeNum > declaredTypeNum) {
      return new Err(
        "Value type U" +
          literalTypeNum +
          " does not fit in variable type U" +
          declaredTypeNum,
      );
    }
  }

  // Transform `read<U8>()` -> `read()` and strip type annotations like `: U8`.
  const prefix = "read<U";
  const suffix = ">()";
  let transformed = "";
  let ti = 0;
  const srcLen = tuffSourceCode.length;
  while (ti < srcLen) {
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
    const ch = tuffSourceCode[ti];
    if (ch === ":" && tuffSourceCode[ti + 1] === " ") {
      ti = identEnd(tuffSourceCode, ti + 2);
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
