type Result<Value, Err = Error> =
  | { ok: true; value: Value }
  | { ok: false; error: Err };

export function compileTuffToTS(input: string): Result<string> {
  const trimmed = input.trim();
  
  if (trimmed === "") {
    return { ok: true, value: "return 0;" };
  }
  
  const match = trimmed.match(/^read<([A-Z0-9]+)>\(\)$/);
  if (match) {
    const type = match[1];
    if (["U8", "U16", "U32", "U64"].includes(type)) {
      return { ok: true, value: "return Number(stdIn);" };
    }
  }
  
  throw new Error("Invalid input: " + input);
}