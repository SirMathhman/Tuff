export function compileTuffToJS(source: string) {
  if (source.includes("#")) {
    throw new Error("Invalid source");
  }
  return "";
}
