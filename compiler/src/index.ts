import type { Result } from "./result";
import { Ok, Err } from "./result";

export { Ok };


export function compile(tuffSourceCode: string): Result<string, string> {
  if (tuffSourceCode === "") {
    return new Ok("return 0;");
  }

  const transformed = transformSource(tuffSourceCode);
  const parts = transformed.split(";");
  let body = "";
  const declaredVars: string[] = [];
  for (let p = 0; p < parts.length - 1; p++) {
    const part = parts[p];
    if (!part) continue;
    const stmt = trim(part);
    if (stmt !== "") {
      const dupErr = checkDuplicateLet(stmt, declaredVars);
      if (dupErr !== null) return new Err(dupErr);
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

function checkDuplicateLet(
  stmt: string,
  declaredVars: string[],
): string | null {
  if (!stmt.startsWith("let ")) return null;
  const afterLet = stmt.slice(4);
  let nameEnd = 0;
  while (nameEnd < afterLet.length && isAlphaNumeric(afterLet[nameEnd])) {
    nameEnd++;
  }
  const varName = afterLet.slice(0, nameEnd);
  for (let i = 0; i < declaredVars.length; i++) {
    if (declaredVars[i] === varName) {
      return "Duplicate variable declaration: " + varName;
    }
  }
  declaredVars.push(varName);
  return null;
}

function transformSource(src: string): string {
  const prefix = "read<U";
  const suffix = ">()";
  let result = "";
  let i = 0;
  while (i < src.length) {
    if (src.slice(i, i + prefix.length) === prefix) {
      let j = i + prefix.length;
      while (j < src.length && isDigit(src[j])) {
        j++;
      }
      if (src.slice(j, j + suffix.length) === suffix) {
        result += "read()";
        i = j + suffix.length;
        continue;
      }
    }

    // Skip type annotations like ": U8", ": U16" etc.
    if (src[i] === ":" && src[i + 1] === " ") {
      i += 2;
      while (i < src.length && isAlphaNumeric(src[i])) {
        i++;
      }
      continue;
    }

    result += src[i];
    i++;
  }
  return result;
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

