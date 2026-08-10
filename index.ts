export function compileTuffToJS(source: string) {
  if (source.includes("#")) {
    throw new Error("Source contains '#' which is not valid Tuff syntax");
  }
  if (/^[\d\s\+\-\*\/\(\)]+$/.test(source)) {
    return "process.exit(" + source + ")";
  }
  return "";
}
