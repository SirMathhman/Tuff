export function compile(source) {
  if (source.trim().length === 0) return "return 0;";

  const hasReadU8 = source.indexOf("read<U8>()") !== -1;
  if (hasReadU8 && !source.includes("let") && !source.includes("const")) {
    return "return parseInt(stdIn, 10) & 255;";
  }

  const hasReadU16 = source.indexOf("read<U16>()") !== -1;
  if (hasReadU16 && !source.includes("let") && !source.includes("const")) {
    return "return parseInt(stdIn, 10) & 65535;";
  }

  const hasReadU32 = source.indexOf("read<U32>()") !== -1;
  if (hasReadU32 && !source.includes("let") && !source.includes("const")) {
    return "return parseInt(stdIn, 10);";
  }
}
