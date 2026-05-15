import type { Result } from "./result";
import { Ok, Err } from "./result";

export { Ok };

export function compile(tuffSourceCode: string): Result<string, string> {
  if (tuffSourceCode === "") {
    return new Ok("return 0;");
  }

  // Check for type mismatches before transforming source
  const rawParts = tuffSourceCode.split(";");
  for (let p = 0; p < rawParts.length - 1; p++) {
    const rawPart = rawParts[p] ?? "";
    const part = trim(rawPart);
    if (!part) continue;

    // Inline: checkTypeMismatch
    if (part.startsWith("let ")) {
      const afterLet = part.slice(4);
      let nameEnd = 0;
      while (nameEnd < afterLet.length && isAlphaNumeric(afterLet[nameEnd])) {
        nameEnd++;
      }
      while (nameEnd < afterLet.length && afterLet[nameEnd] === " ") {
        nameEnd++;
      }
      if (afterLet[nameEnd] === ":") {
        let skip = nameEnd + 1;
        while (skip < afterLet.length && afterLet[skip] === " ") {
          skip++;
        }
        const typeStart = skip;
        while (skip < afterLet.length && isAlphaNumeric(afterLet[skip])) {
          skip++;
        }
        // Inline: extractNumberFromText
        const typeText = afterLet.slice(typeStart, skip);
        let numStr = "";
        for (let ci = 0; ci < typeText.length; ci++) {
          if (isDigit(typeText[ci])) numStr += typeText[ci];
        }
        const parsedTypeNum = parseInt(numStr, 10);
        const declaredTypeNum = isNaN(parsedTypeNum) ? 8 : parsedTypeNum;

        let eqIdx = skip;
        while (eqIdx < afterLet.length && afterLet[eqIdx] !== "=") {
          eqIdx++;
        }
        if (eqIdx < afterLet.length) {
          const rhs = trim(afterLet.slice(eqIdx + 1));
          // Inline: extractLiteralSuffix
          let si = rhs.length - 1;
          while (si >= 0 && isDigit(rhs[si])) {
            si--;
          }
          let literalTypeNum = 8;
          if (si >= 0 && rhs[si] === "U" && si > 0 && isDigit(rhs[si - 1])) {
            let k = si - 2;
            while (k >= 0 && isDigit(rhs[k])) {
              k--;
            }
            if (!(k >= 0 && rhs[k] === "<")) {
              let suffixStr = "";
              let sj = si + 1;
              while (sj < rhs.length && isDigit(rhs[sj])) {
                suffixStr += rhs[sj];
                sj++;
              }
              if (suffixStr.length > 0) {
                const parsedSuffix = parseInt(suffixStr, 10);
                literalTypeNum = isNaN(parsedSuffix) ? 8 : parsedSuffix;
              }
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
      }
    }
  }

  // Inline: transformSource
  const prefix = "read<U";
  const suffix = ">()";
  let transformed = "";
  let ti = 0;
  while (ti < tuffSourceCode.length) {
    if (tuffSourceCode.slice(ti, ti + prefix.length) === prefix) {
      let tj = ti + prefix.length;
      while (tj < tuffSourceCode.length && isDigit(tuffSourceCode[tj])) {
        tj++;
      }
      if (tuffSourceCode.slice(tj, tj + suffix.length) === suffix) {
        transformed += "read()";
        ti = tj + suffix.length;
        continue;
      }
    }
    if (tuffSourceCode[ti] === ":" && tuffSourceCode[ti + 1] === " ") {
      ti += 2;
      while (ti < tuffSourceCode.length && isAlphaNumeric(tuffSourceCode[ti])) {
        ti++;
      }
      continue;
    }
    transformed += tuffSourceCode[ti];
    ti++;
  }

  const parts = transformed.split(";");
  let body = "";
  const declaredVars: string[] = [];
  for (let p = 0; p < parts.length - 1; p++) {
    const part = parts[p] ?? "";
    if (!part) continue;
    const stmt = trim(part);
    if (stmt !== "") {
      // Inline: checkDuplicateLet
      if (stmt.startsWith("let ")) {
        const afterLet = stmt.slice(4);
        let nameEnd = 0;
        while (nameEnd < afterLet.length && isAlphaNumeric(afterLet[nameEnd])) {
          nameEnd++;
        }
        const varName = afterLet.slice(0, nameEnd);
        for (let i = 0; i < declaredVars.length; i++) {
          if (declaredVars[i] === varName) {
            return new Err("Duplicate variable declaration: " + varName);
          }
        }
        declaredVars.push(varName);
      }
      body += stmt + ";\n";
    }
  }
  const lastPart = parts[parts.length - 1] ?? "";
  const lastExpr = trim(lastPart);

  return new Ok(
    'const inputs = stdIn.split(" ").map(Number);\nlet idx = 0;\nfunction read() { return inputs[idx++]; }\n' +
      body +
      "return " +
      lastExpr +
      ";",
  );
}

function isDigit(ch: string | undefined): boolean {
  if (!ch) return false;
  return ch >= "0" && ch <= "9";
}

function isAlphaNumeric(ch: string | undefined): boolean {
  if (!ch) return false;
  if (ch >= "a" && ch <= "z") return true;
  if (ch >= "A" && ch <= "Z") return true;
  if (ch >= "0" && ch <= "9") return true;
  return false;
}

function trim(s: string): string {
  let start = 0;
  while (start < s.length && (s[start] === " " || s[start] === "\t")) start++;
  let end = s.length;
  while (end > start && (s[end - 1] === " " || s[end - 1] === "\t")) end--;
  return s.slice(start, end);
}
