import { Ok, type Result } from "./result";

const RETURN = "return ";
const T = "tokens";

export enum CompileError {
  NotImplemented,
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isAlphaNumOrUnderscore(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || isDigit(ch) || ch === "_";
}

function stripTypeSuffixes(input: string): string {
  let result = "";
  const len = input.length;
  for (let i = 0; i < len; ) {
    if (!isDigit(input[i] ?? "")) {
      // Not a digit - just copy the character as-is
      result += input[i];
      i++;
      continue;
    }

    // Collect only the digits, skip any type suffix after them
    const numStart = i;
    while (i < len && isDigit(input[i] ?? "")) {
      i++;
    }
    result += input.substring(numStart, i);
    // Skip past any type suffix characters that follow the number
    while (i < len && isAlphaNumOrUnderscore(input[i] ?? "")) {
      i++;
    }

  }

  return result;
}

export function compile(input: string): Result<string, CompileError> {
  const trimmed = input.trim();
  if (trimmed === "") {
    return new Ok(RETURN + "0");
  }

  // Strip type annotations like ": U8" from variable declarations without regex
  let processed = "";
  const len = trimmed.length;
  for (let idx = 0; idx < len; ) {
    const colonIdx = trimmed.indexOf(" : ", idx);
    if (colonIdx === -1) {
      processed += trimmed.substring(idx);
      break;
    } else {
      processed += trimmed.substring(idx, colonIdx);
      // Skip past the type name: starts with uppercase letter after " : "
      idx = colonIdx + 3;
      while (idx < len && trimmed[idx] !== " ") {
        idx++;
      }
    }
  }

  // Strip type suffixes from numeric literals (e.g., "10U8" -> "10")
  const stripped = stripTypeSuffixes(processed);

  // Replace each read<U8>() with Number(tokens[i++])
  let replaced = "";
  let remaining = stripped;
  while (remaining.length > 0) {
    const matchIndex = remaining.indexOf("read<U8>()");
    if (matchIndex === -1) {
      replaced += remaining;
      break;
    } else {
      replaced += remaining.substring(0, matchIndex);
      replaced += "Number(" + T + "[i++])";
      remaining = remaining.substring(matchIndex + 10); // length of "read<U8>()" is 10
    }
  }

  // Split by semicolons to handle multiple statements; only last part gets returned
  const parts = replaced.split(";");
  let body = "";
  const lastIndex = parts.length - 1;
  for (let p = 0; p < lastIndex; p++) {
    const segment: string | undefined = parts[p];
    if ((segment ?? "").trim() !== "") {
      body += segment + ";";
    }
  }
  // Last part is the expression to return
  const lastPart: string | undefined = parts[lastIndex] ?? "";
  if (lastPart.trim() === "") {
    body += RETURN + "0;";
  } else {
    body += RETURN + lastPart + ";";
  }

  return new Ok("const " + T + " = stdIn.trim().split(' '); let i = 0;" + body);
}


