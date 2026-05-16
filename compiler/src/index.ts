const returnStr = "return ";
const defaultReturn = returnStr + "0;";
const constKeyword = "const ";

import { Ok, Err } from "./result";

function okDefault(): Ok<string> {
  return new Ok(defaultReturn);
}

export function compile(source: string): Ok<string> | Err<string> {
  if (source.trim() === "") {
    return okDefault();
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
    return okDefault();
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
  const declaredVars: string[] = [];
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (trimmed === "") {
      code += defaultReturn + "\n";
      continue;
    }

    const letIdx = trimmed.indexOf("let ");
    if (letIdx === -1) {
      code += returnStr + trimmed + "\n";
      continue;
    }

    // Extract variable name from "let x" or "let x : Type ="
    const afterLet = trimmed.substring(letIdx + "let ".length);
    let varName: string;
    const colonPos = afterLet.indexOf(":");
    const eqPos = afterLet.indexOf("=");
    if (colonPos !== -1) {
      varName = afterLet.substring(0, colonPos).trim();
    } else {
      varName = afterLet.substring(0, eqPos).trim();
    }

    // Check for duplicate variable declaration
    if (declaredVars.indexOf(varName) !== -1) {
      return new Err("duplicate variable: " + varName);
    }
    declaredVars.push(varName);

    if (eqPos >= 0) {
      const value = afterLet.substring(eqPos + 1).trim();
      code += constKeyword + varName + " = " + value + "\n";
    } else {
      code += "";
    }
  }

  return new Ok(code);
}
