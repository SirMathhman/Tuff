export function compileTuffToJS(source: string) {
  if (source === "") {
    return "";
  }
  const jsSource = source.replace(/{/g, "(").replace(/}/g, ")");
  if (/^[\d\s\+\-\*\/\(\)]+$/.test(jsSource)) {
    return "process.exit(" + jsSource + ")";
  }
  throw new Error("Source contains invalid Tuff syntax");
}
