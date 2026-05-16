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

  for (const type of ["U8", "I8", "U16", "I16", "U32", "I32", "F32", "F64"]) {
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

// Helper: look up the inferred/declared type of a variable by its name
  function lookupType(varName: string): string | undefined {
    for (let vi = 0; vi < reads.length; vi++) {
      if (varName === "v" + vi) return varTypes[vi];
    }
    for (const entry of allVarTypes) {
      if (entry.name === varName) return entry.type;
    }
    return undefined;
  }

// Shared Ok value for success cases where no payload is needed
  const okVoid = new Ok(undefined);

  // Helper: check type compatibility and return Err on mismatch, or okVoid when compatible
  function checkAssignable(srcType: string | undefined, targetType: string | undefined): Ok<void> | Err<string> {
    if (srcType !== undefined && targetType !== undefined && !fitsIn(srcType, targetType)) {
      return new Err("type mismatch: cannot assign " + srcType + " to " + targetType);
    }
    return okVoid;
  }

  // Helper: process an assignment statement and append generated JS code
  function emitAssignment(
    varName: string, value: string, declaredType: string | undefined, isMutable: boolean,
  ): Ok<void> | Err<string> {
    const srcType = lookupType(value);
    const existingType = lookupType(varName);
    const targetType = declaredType !== undefined ? declaredType : existingType;
    const assignResult = checkAssignable(srcType, targetType);
    if (assignResult instanceof Err) return assignResult;

    // Record this variable's effective type for later lookups only if not already known
    const effectiveType = declaredType ?? srcType ?? "";
    if (effectiveType.length > 0 && existingType === undefined) {
      allVarTypes.push({ name: varName, type: effectiveType });
    }

    // Use 'let' for mutable vars, 'const' otherwise; bare reassignments omit the keyword
    const keyword = isMutable ? "let" : (existingType !== undefined ? "" : constKeyword);
    code += keyword + varName + " = " + value + "\n";
    return okVoid;
  }

  for (const stmt of expr.split(";")) {
    const trimmed = stmt.trim();
    if (trimmed === "") {
      code += defaultReturn + "\n";
      continue;
    }

    // Check if this is a let declaration or a bare assignment like "x = ..."
    const letIdx = trimmed.indexOf("let ");
    if (letIdx !== -1) {
      // This is a `let` declaration
      const afterLet = trimmed.substring(letIdx + "let ".length);

      // Check for mut keyword: "mut x" or just "x"
      let restOfDecl = afterLet;
      let isMutable = false;
      if (restOfDecl.startsWith("mut ")) {
        isMutable = true;
        restOfDecl = restOfDecl.substring(4); // skip "mut "
      }

      // Extract variable name from "x" or "x : Type ="
      let varName: string;
      let declaredType: string | undefined;
      const colonPos = restOfDecl.indexOf(":");
      const eqPos = restOfDecl.indexOf("=");

      if (colonPos !== -1) {
        // Has type annotation: extract both name and type
        varName = restOfDecl.substring(0, colonPos).trim();
        declaredType = restOfDecl
          .substring(colonPos + 1, eqPos >= 0 ? eqPos : restOfDecl.length)
          .trim();
      } else {
        varName = restOfDecl.substring(0, eqPos).trim();
      }

      // Check for duplicate variable declaration
      if (declaredVars.indexOf(varName) !== -1) {
        return new Err("duplicate variable: " + varName);
      }
      declaredVars.push(varName);

    if (eqPos >= 0) {
        const value = restOfDecl.substring(eqPos + 1).trim();

        // Type check and emit the assignment
        const assignResult = emitAssignment(varName, value, declaredType, isMutable);
        if (assignResult instanceof Err) return assignResult;
      } else {
        code += "";
      }
    } else if (trimmed.includes("=")) {
      // Bare assignment: e.g. "x = read<U8>()" or "x = y"
      const eqPos = trimmed.indexOf("=");
      const varName = trimmed.substring(0, eqPos).trim();
      const value = trimmed.substring(eqPos + 1).trim();
     // Type check and emit the reassignment (no declared type, not mutable — just a bare assignment)
      const assignResult = emitAssignment(varName, value, undefined, false);
      if (assignResult instanceof Err) return assignResult;
    } else {
      // Expression statement — treat as return
      code += returnStr + trimmed + "\n";
    }
  }

  return new Ok(code);
}


