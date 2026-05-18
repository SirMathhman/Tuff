import { Ok, type Result } from "./result";

const RETURN = "return ";
const T = "tokens";

function isWhitespace(char: string | undefined): boolean {
  return (
    char === " " ||
    char === "\t" ||
    char === "\n" ||
    char === "\r" ||
    char === undefined
  );
}

export enum CompileError {
  NotImplemented,
}

export function compile(input: string): Result<string, CompileError> {
  const trimmed = input.trim();
  if (trimmed === "") {
    return new Ok(RETURN + "0");
  }

  // Strip type annotations like ": U8" from variable declarations without regex
  let processed = "";
  for (let idx = 0; idx < trimmed.length; ) {
    const colonIdx = trimmed.indexOf(" : ", idx);
    if (colonIdx === -1) {
      processed += trimmed.substring(idx);
      break;
    } else {
      processed += trimmed.substring(idx, colonIdx);
      // Skip past the type name: starts with uppercase letter after " : "
      const typeStart = colonIdx + 3;
      idx = typeStart;
      while (!isWhitespace(trimmed[idx])) {
        idx++;
      }
    }
  }

  // Replace each read<U8>() with Number(tokens[i++])
  let replaced = "";
  let remaining = processed;
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
