const RETURN_PREFIX = "return";
export const STD_IN = "stdIn";
export const READ_TYPES = ["U8", "U16", "U32", "U64"];
export const READ_PREFIX = "read<";
const PARSE_INT_PREFIX = "parseInt(";
const STD_IN_PARTS = STD_IN + "Parts";

const TRIM_CALL = ".trim()";

function makeReadStr(type: string) {
  return READ_PREFIX + type + ">()";
}

export function compile(source: string) {
  if (source === "") return RETURN_PREFIX + " " + "0";

  let result = source;
  const readStrs: [string, number][] = [];
  for (const type of READ_TYPES) {
    const searchStr = makeReadStr(type);
    const count = result.split(searchStr).length - 1;
    if (count > 0) readStrs.push([searchStr, count]);
  }

  let totalReads = 0;
  for (const [, c] of readStrs) totalReads += c;

  const replacements: string[] = [];
  for (let i = 0; i < totalReads; i++) {
    if (totalReads > 1) {
      replacements.push(
        "(" + PARSE_INT_PREFIX + STD_IN_PARTS + "[" + i + "],10)||0)",
      );
    } else {
      replacements.push(PARSE_INT_PREFIX + STD_IN + TRIM_CALL + ", 10)");
    }
  }

  let repIdx = 0;
  for (const [searchStr] of readStrs) {
    while (result.includes(searchStr)) {
      result = result.replace(searchStr, replacements[repIdx] || "0");
      repIdx++;
    }
  }

  if (totalReads > 1)
    return (
      "let " +
      STD_IN_PARTS +
      "=" +
      STD_IN +
      TRIM_CALL +
      ".split(/\\s+/);\n" +
      RETURN_PREFIX +
      " " +
      result +
      ";"
    );
  return RETURN_PREFIX + " " + result + ";";
}
