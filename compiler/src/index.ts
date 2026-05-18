import { Ok, type Result } from "./result";

const RETURN = "return ";
const T = "tokens";

export enum CompileError {
  NotImplemented,
}

export function compile(input: string): Result<string, CompileError> {
  const trimmed = input.trim();
  if (trimmed === "") {
    return new Ok(RETURN + "0");
  }

  // Replace each read<U8>() with Number(tokens[i++])
  let output = "";
  let remaining = trimmed;
  while (remaining.length > 0) {
    const matchIndex = remaining.indexOf("read<U8>()");
    if (matchIndex === -1) {
      output += remaining;
      break;
    } else {
      output += remaining.substring(0, matchIndex);
      output += "Number(" + T + "[i++])";
      remaining = remaining.substring(matchIndex + 10); // length of "read<U8>()" is 10
    }
  }

  return new Ok(
    "const " + T + " = stdIn.trim().split(' '); let i = 0;" + RETURN + output,
  );
}
