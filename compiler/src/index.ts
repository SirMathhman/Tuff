export function compile(source: string) {
  if (source === "") return "return" + " " + "0";

  let result = source;
  for (const type of (["U8", "U16", "U32"])) {
    const searchStr = "read<" + type + ">()";
    result = result.replace(searchStr, "parseInt(stdIn.trim(), 10)");
  }

  return "return" + " " + result + ";";
}

