const returnStr = "return ";
const defaultReturn = returnStr + "0;";

function buildReadExpr(type: string) {
  return "read<" + type + ">()";
}

export function compile(source: string) {
  if (source.trim() === "") {
    return defaultReturn;
  }

  const types = ["U8", "I8", "U16", "I16", "U32", "I32", "F32", "F64"];
  const reads: string[] = [];
  const readExprs: string[] = [];

  for (const type of types) {
    const readExpr = buildReadExpr(type);
    let idx = source.indexOf(readExpr);
    while (idx !== -1) {
      reads.push(type);
      readExprs.push(readExpr);
      idx = source.indexOf(readExpr, idx + 1);
    }
  }

  if (reads.length === 0) {
    return defaultReturn;
  }

  const stdInPart = "stdIn.replace(',', ' ').split(' ')[i] || stdIn";
  const parsePrefix = "parse";
  let code = "";
  let expr = source;

  for (let i = 0; i < reads.length; i++) {
    const type: string | undefined = reads[i];
    if (type === undefined) continue;
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
    code += "const v" + i + " = " + parseExpr + ";\n";
    const readExpr: string | undefined = readExprs[i];
    if (readExpr === undefined) continue;
    expr = expr.replace(readExpr, "v" + i);
  }

  code += returnStr + expr + ";";
  return code;
}

