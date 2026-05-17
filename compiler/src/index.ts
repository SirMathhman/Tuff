const returnStr = "return ";
const defaultReturn = returnStr + "0;";
const constKeyword = "const ";
const boolTrue = "true";
const boolFalse = "false";

import { Ok, Err } from "./result";

export enum CompileError {
  DuplicateVariable = "duplicate_variable",
  TypeMismatch = "type_mismatch",
  ImmutableReassignment = "immutable_reassignment",
}

// Size rank for each type: higher means larger range. Bool is special (rank -1).
function typeRank(t: string): number {
  if (t === "U8" || t === "I8") return 1;
  if (t === "U16" || t === "I16") return 2;
  if (t === "U32" || t === "I32") return 3;
  if (t === "F32") return 4;
  if (t === "F64") return 5;
  if (t === "Bool") return -1;
  return 0;
}
// Check if source type can always fit into target type
// Extract type from typed literal like "1U8", "5I32" etc. Returns undefined for non-typed values.
// Convert Tuff if/else expression to JS ternary: if(cond) a else b => cond ? a : b

export function compile(source: string): Ok<string> | Err<CompileError> {
  if (source.trim() === "") {
    return new Ok(defaultReturn);
  }
  const reads: string[] = [];
  const readExprs: string[] = [];

  for (const type of [
    "U8",
    "I8",
    "U16",
    "I16",
    "U32",
    "I32",
    "F32",
    "F64",
    "Bool",
  ]) {
    const readExpr = "read<" + type + ">()";
    let idx = source.indexOf(readExpr);
    while (idx !== -1) {
      reads.push(type);
      readExprs.push(readExpr);
      idx = source.indexOf(readExpr, idx + 1);
    }
  }

  if (reads.length === 0) {
    return (() => {
      const expr = source;
      return compileStatements(expr, "", [], 0);
    })();
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
    if (type === "Bool") {
      parseExpr = ("(" + stdInPart + ') !== "' + boolFalse + '"').replace(
        "[i]",
        indexBracket,
      );
    } else if (type === "F32" || type === "F64") {
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
  return compileStatements(expr, code, varTypes, reads.length);
}

// Compile source that has no read expressions (e.g. boolean literals)
// Shared logic for processing statements after read expressions are replaced
function compileStatements(
  expr: string,
  initialCode: string,
  varTypes: string[],
  readsCount: number,
): Ok<string> | Err<CompileError> {
  let code = initialCode;

  // Split by semicolons and process each statement
  const declaredVars: string[] = [];
  // Track which variables were declared as mutable
  const mutVars: Set<string> = new Set();
  // Map variable names to their types (both generated v0..vn and user-declared x, y, etc.)
  const allVarTypes: { name: string; type: string }[] = [];

  // Helper: look up the inferred/declared type of a variable by its name
  function lookupType(varName: string): string | undefined {
    for (let vi = 0; vi < readsCount; vi++) {
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
  function checkAssignable(
    srcType: string | undefined,
    targetType: string | undefined,
  ): Ok<void> | Err<CompileError> {
    if (
      srcType !== undefined &&
      targetType !== undefined &&
      !(() => {
        const srcRank = typeRank(srcType);
        const tgtRank = typeRank(targetType);
        if (srcRank === -1 && tgtRank !== -1) return false;
        if (tgtRank === -1 && srcRank !== -1) return false;
        return srcRank <= tgtRank;
      })()
    ) {
      return new Err(CompileError.TypeMismatch);
    }
    return okVoid;
  }

  // Helper: process an assignment statement and append generated JS code
  function emitAssignment(
    varName: string,
    value: string,
    declaredType: string | undefined,
    isMutable: boolean,
  ): Ok<void> | Err<CompileError> {
    let srcType = lookupType(value);

    // Handle bool literals by setting their type explicitly
    if (value === boolTrue || value === boolFalse) {
      srcType = "Bool";
    }

    // Extract type from typed numeric literals like 1U8, 5I32 etc.
    const literalType = (() => {
      const types = ["F64", "F32", "U32", "I32", "U16", "I16", "U8", "I8"];
      for (const t of types) {
        if (value.endsWith(t)) return t;
      }
      return undefined;
    })();
    if (literalType !== undefined) {
      srcType = literalType;
    }

    // Convert Tuff if/else to JS ternary before emitting
    const convertedValue = (() => {
      const prefix = "if (";
      const idx = value.indexOf(prefix);
      if (idx !== 0) return value;
      const conditionStart = idx + prefix.length;
      let depth = 0;
      let condEnd = -1;
      for (let i = conditionStart - 1; i < value.length; i++) {
        const ch = value[i];
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (depth === 0) {
            condEnd = i;
            break;
          }
        }
      }
      if (condEnd === -1) return value;
      const condition = value.substring(conditionStart, condEnd);
      const rest = value.substring(condEnd + 1).trim();
      for (let i = 0; i < rest.length - 3; i++) {
        if (rest.substring(i, i + 4) === "else") {
          const thenBranch = rest.substring(0, i).trim();
          const elseBranch = rest.substring(i + 4).trim();
          return (
            "(" + condition + ") ? (" + thenBranch + ") : (" + elseBranch + ")"
          );
        }
      }
      return value;
    })();

    const existingType = lookupType(varName);
    const targetType = declaredType !== undefined ? declaredType : existingType;
    const assignResult = checkAssignable(srcType, targetType);
    if (assignResult instanceof Err) return assignResult;

    // Record this variable's effective type for later lookups only if not already known
    const resolvedType = declaredType ?? srcType ?? "";
    if (resolvedType.length > 0 && existingType === undefined) {
      allVarTypes.push({ name: varName, type: resolvedType });
    }

    // Use 'let' for mutable vars, 'const' otherwise; bare reassignments omit the keyword
    const kw = isMutable
      ? "let"
      : existingType !== undefined
        ? ""
        : constKeyword;
    code += kw + varName + " = " + convertedValue + "\n";
    return okVoid;
  }

  // Helper: detect if an expression contains comparison operators (<, >, <=, >=, ==, !=)
  function isComparisonExpr(expr: string): boolean {
    return (
      expr.includes("<") ||
      expr.includes(">") ||
      expr.includes("==") ||
      expr.includes("!=")
    );
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
        return new Err(CompileError.DuplicateVariable);
      }
      declaredVars.push(varName);

      // Track mutable variables for later reassignment checks
      if (isMutable) {
        mutVars.add(varName);
      }

      if (eqPos >= 0) {
        const value = restOfDecl.substring(eqPos + 1).trim();

        // Type check and emit the assignment
        const assignResult = emitAssignment(
          varName,
          value,
          declaredType,
          isMutable,
        );
        if (assignResult instanceof Err) return assignResult;
      } else {
        code += "";
      }
    } else if (trimmed.includes("=") && !isComparisonExpr(trimmed)) {
      // Bare assignment: e.g. "x = read<U8>()" or "x = y"
      const eqPos = trimmed.indexOf("=");
      const varName = trimmed.substring(0, eqPos).trim();

      // Reject reassignment of immutable variables
      if (!mutVars.has(varName)) {
        return new Err(CompileError.ImmutableReassignment);
      }

      const value = trimmed.substring(eqPos + 1).trim();

      // Type check and emit the reassignment (no declared type, not mutable — just a bare assignment)
      const assignResult = emitAssignment(varName, value, undefined, false);
      if (assignResult instanceof Err) return assignResult;
    } else {
      // Expression statement — treat as return. Handle bool literals and Bool-typed variables here too.
      const retExpr = trimmed;
      const isBoolLiteral = retExpr === boolTrue || retExpr === boolFalse;
      const isBoolVar = lookupType(retExpr) === "Bool";
      const hasBoolOp = retExpr.includes("||") || retExpr.includes("&&");
      const hasCmpOp = isComparisonExpr(retExpr);

      if (isBoolLiteral || isBoolVar || hasBoolOp || hasCmpOp) {
        code += returnStr + "(+(" + retExpr + "))\n";
      } else {
        code += returnStr + retExpr + "\n";
      }
    }
  }

  return new Ok(code);
}
