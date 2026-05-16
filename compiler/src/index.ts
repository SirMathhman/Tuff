const returnStr = "return ";
const defaultReturn = returnStr + "0;";
const constKeyword = "const ";

export function compile(source: string) {
  if (source.trim() === "") {
    return defaultReturn;
  }

  const types = ["U8", "I8", "U16", "I16", "U32", "I32", "F32", "F64"];
  const reads: string[] = [];
  const readExprs: string[] = [];

  for (const type of types) {
    const readExpr = "read<" + type + ">()";
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
    code += constKeyword + "v" + i + " = " + parseExpr + ";\n";
    const readExpr: string | undefined = readExprs[i];
    if (readExpr === undefined) continue;
    expr = expr.replace(readExpr, "v" + i);
  }

  // Split by semicolons and process each statement
  const statements = expr.split(";");
  for (const stmt of statements) {
    code +=
      (() => {
        if (stmt.trim() === "") {
          return defaultReturn;
        }
        const letIdx = stmt.trim().indexOf("let ");
        if (letIdx === -1) {
          return returnStr + stmt.trim();
        }
        const afterLet = stmt.trim().substring(letIdx + "let ".length);
        const colonPos = afterLet.indexOf(":");
        const eqPos = afterLet.indexOf("=");
        const hasColon = colonPos >= 0;
        const noEq = eqPos < 0;
        let varName: string;
        let valueStart: number;
        if (hasColon && !noEq && colonPos < eqPos) {
          // Has type annotation between name and '='
          varName = afterLet.substring(0, colonPos).trim();
          valueStart = eqPos + 1;
        } else {
          const firstSep = noEq
            ? hasColon
              ? colonPos
              : afterLet.length
            : eqPos;
          varName = afterLet.substring(0, firstSep).trim();
          valueStart = noEq ? afterLet.length : eqPos + 1;
        }
        if (valueStart < afterLet.length) {
          const value = afterLet.substring(valueStart).trim();
          return constKeyword + varName + " = " + value;
        }
        return "";
      })() + "\n";
  }

  return code;
}
