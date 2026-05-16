const returnStr = "return ";
const defaultReturn = returnStr + "0;";

export function compile(source: string) {
  if (source.trim() === "") {
    return defaultReturn;
  }

  const types = ["U8", "I8", "U16", "I16", "U32", "I32", "F32", "F64"];
  const reads: string[] = [];

  for (const type of types) {
    const readExpr = "read<" + type + ">()";
    let idx = source.indexOf(readExpr);
    while (idx !== -1) {
      reads.push(type);
      idx = source.indexOf(readExpr, idx + 1);
    }
  }

  if (reads.length === 0) {
    return defaultReturn;
  }

  const stdInPart = "stdIn.split(',')[i] || stdIn";
  const parsePrefix = "parse";
  const parts: string[] = [];
  for (let i = 0; i < reads.length; i++) {
    const type = reads[i];
    let parseExpr: string;
    const indexBracket = "[" + i + "]";
    if (type === "F32" || type === "F64") {
      parseExpr = (parsePrefix + "Float(" + stdInPart + ")").replace(
        "[i]",
        indexBracket,
      );
    } else {
      parseExpr = (parsePrefix + "Int(" + stdInPart + ", 10)").replace(
        "[i]",
        indexBracket,
      );
    }
    parts.push(parseExpr);
  }

  if (parts.length === 1) {
    return returnStr + parts[0] + ";";
  } else {
    let code = "";
    for (let j = 0; j < parts.length; j++) {
      code += "const v" + j + " = " + parts[j] + ";\n";
    }
    code += returnStr + parts[parts.length - 1] + ";";
    return code;
  }
}
