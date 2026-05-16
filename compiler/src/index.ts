const RETURN_PREFIX = "return";
export const STD_IN = "stdIn";
export const READ_TYPES = ["U8", "U16", "U32", "U64"];
export const READ_PREFIX = "read<";

export function compile(source: string) {
  if (source === "") return RETURN_PREFIX + " " + "0";

  let result = source;
  for (const type of READ_TYPES) {
    const searchStr = READ_PREFIX + type + ">()";
    result = result.replace(searchStr, "parseInt(" + STD_IN + ".trim(), 10)");
  }

  return RETURN_PREFIX + " " + result + ";";
}
