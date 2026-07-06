export function ok(value) {
  return { isOk: true, value };
}

export function err(error) {
  return { isOk: false, error };
}

export function compileTuffToJS(source) {
  if (source.trim() === "") {
    return ok("return 0;");
  }
  return err("Invalid source code: " + source);
}
