type Result<Value, Err> =
  | { ok: true; value: Value }
  | { ok: false; error: Err };

export function compileTuffToTS(input: string): Result<string, string> {
  const trimmed = input.trim();

  if (trimmed === "") {
    return { ok: true, value: "return 0;" };
  }

  if (!trimmed.startsWith("read<") || !trimmed.endsWith(">")) {
    return { ok: false, error: "Invalid Tuff source code" };
  }

  const type = trimmed.slice(5, -1);
  let isValidType = type.length > 0;
  for (let i = 0; i < type.length && isValidType; i++) {
    const c = type[i];
    isValidType = (c >= "A" && c <= "Z") || (c >= "0" && c <= "9");
  }

  if (!isValidType) {
    return { ok: false, error: "Invalid Tuff source code" };
  }

  if (["U8", "U16", "U32", "U64"].includes(type)) {
    return { ok: true, value: "return Number(stdIn);" };
  }

  return { ok: false, error: "Invalid Tuff source code" };
}