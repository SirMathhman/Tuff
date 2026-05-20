export function compile(source) {
  if (source.trim().length === 0) return "return 0;";

  const hasReadU8 = source.indexOf("read<U8>()") !== -1;
  if (hasReadU8 && !source.includes("let") && !source.includes("const")) {
    return "return parseInt(stdIn, 10) & 255;";
  }
}
