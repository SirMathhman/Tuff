type Result<Value, Err = Error> =
  | { ok: true; value: Value }
  | { ok: false; error: Err };

export function compileTuffToTS(input: string): Result<string> {
  if (input.trim() === "") {
    return { ok: true, value: "return 0;" };
  }
  if (input.trim() === "read<U8>()") {
    return { ok: true, value: "return Number(stdIn);" };
  }
  if (input.trim() === "read<U16>()") {
    return { ok: true, value: "return Number(stdIn);" };
  }
  if (input.trim() === "read<U32>()") {
    return { ok: true, value: "return Number(stdIn);" };
  }
  return { ok: false, error: new Error("Invalid input: " + input) };
}
