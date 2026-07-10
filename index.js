export function compileTuffToJS(source) {
  if (source.trim() === "") return "return 0;";
  throw new Error("Unknown source code: " + source);
}
