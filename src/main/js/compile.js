export function compile(source) {
  if (source === "") {
    return { ok: true, code: "return 0;" };
  }
  return { ok: false, error: "Unknown source code: " + source };
}
