export function ok(value) {
  return { isOk: true, value };
}

export function err(error) {
  return { isOk: false, error };
}

export function compileTuffToJS(source) {
  return err("Invalid source code: " + source);
}
