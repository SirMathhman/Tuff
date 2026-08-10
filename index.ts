export function compileTuffToJS(source: string) {
  if (/^[\d\s\+\-\*\/\(\)]+$/.test(source)) {
    return "process.exit(" + source + ")";
  }
  throw new Error("Source contains invalid Tuff syntax");
}
