const returnStr = "return ";
const defaultReturn = returnStr + "0;";
const constKeyword = "const ";

import { Ok, Err } from "./result";

function okDefault(): Ok<string> {
  return new Ok(defaultReturn);
}

// Size rank for each type: higher means larger range
function typeRank(t: string): number {
  if (t === "U8" || t === "I8") return 1;
  if (t === "U16" || t === "I16") return 2;
  if (t === "U32" || t === "I32") return 3;
  if (t === "F32") return 4;
  if (t === "F64") return 5;
  return 0;
}

// Check if source type can always fit into target type
function fitsIn(sourceType: string, targetType: string): boolean {
  return typeRank(sourceType) <= typeRank(targetType);
}

export function compile(source: string): Ok<string> | Err<string> {
  if (source.trim() === "") {
    return okDefault();
  }
  const reads: string[] = [];
  const readExprs: string[] = [];

  for (const type of (["U8", "I8", "U16", "I16", "U32", "I32", "F32", "F64"])) {
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

  // Map from generated variable name to its type (e.g. v0 -> U16)
  const varTypes: string[] = [];

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
    varTypes.push(type);
    const readExpr: string | undefined = readExprs[i];
    if (readExpr === undefined) continue;
    expr = expr.replace(readExpr, "v" + i);
  }

  // Split by semicolons and process each statement
  const declaredVars: string[] = [];
  // Map variable names to their types (both generated v0..vn and user-declared x, y, etc.)
  const allVarTypes: { name: string; type: string }[] = [];

  for (const stmt of expr.split(";")) {
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
    let declaredType: string | undefined;
    const colonPos = afterLet.indexOf(":");
    const eqPos = afterLet.indexOf("=");

    if (colonPos !== -1) {
      // Has type annotation: extract both name and type
      varName = afterLet.substring(0, colonPos).trim();
      declaredType = afterLet
        .substring(colonPos + 1, eqPos >= 0 ? eqPos : afterLet.length)
        .trim();
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

      // Determine the source type of `value` — could be a generated vN or a user-declared variable
      let srcType: string | undefined;
      for (let vi = 0; vi < reads.length; vi++) {
        if (value === ("v" + vi)) {
          srcType = varTypes[vi];
        }
      }

      // If not a generated variable, check user-declared variables for their type
      if (srcType === undefined) {
        for (let ui = 0; ui < allVarTypes.length; ui++) {
          const entry: { name: string; type: string } | undefined =
            allVarTypes[ui];
          if (entry !== undefined && value === entry.name) {
            srcType = entry.type;
          }
        }
      }

      // Type check: if we have a declared target type and know the source type, verify compatibility
      if (
        declaredType !== undefined &&
        srcType !== undefined &&
        !fitsIn(srcType, declaredType)
      ) {
        return new Err(
          "type mismatch: cannot assign " + srcType + " to " + declaredType,
        );
      }

      // Record this variable's effective type for later lookups
      const effectiveType =
        declaredType !== undefined
          ? declaredType
          : srcType !== undefined
            ? srcType
            : "";
      if (effectiveType.length > 0) {
        allVarTypes.push({ name: varName, type: effectiveType });
      }

      code += constKeyword + varName + " = " + value + "\n";
    } else {
      code += "";
    }
  }

  return new Ok(code);
}
