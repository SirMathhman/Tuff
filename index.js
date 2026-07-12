export function compile(source) {
  if (source.trim() === "") return "return 0;";
  throw new Error("Unknown source: " + source);
}
