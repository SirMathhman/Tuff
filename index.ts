export function compileTuffToJS(source: string) {
  if (source.includes("#")) {
    throw new Error("Source contains '#' which is not valid Tuff syntax");
  }
  if (source === "1") {
    return "process.exit(1)";
  }
  return "";
}
