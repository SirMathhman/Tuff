export function compileTuffToJS(source: string) {
  if (source.includes("#")) {
    throw new Error("Source contains '#' which is not valid Tuff syntax");
  }
  return "";
}
