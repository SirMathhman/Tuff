export function compile(source: string) {
  if (source === "") return "return 0";

  // Support read<U8>() - reads a number from stdin as unsigned 8-bit integer
  source = source.replace("read<U8>()", "parseInt(stdIn.trim(), 10)");
  source = source.replace("read<U16>()", "parseInt(stdIn.trim(), 10)");

  return "return " + source + ";";
}
