const returnStr = "return ";
const defaultReturn = returnStr + "0;";
const constKeyword = "const ";
const boolTrue = "true";
const boolFalse = "false";
const varSuffix = "_variable";

import { Ok, Err } from "./result";
export enum CompileError {
  DuplicateVariable = "duplicate" + varSuffix,
  TypeMismatch = "type_mismatch",
  ImmutableReassignment = "immutable_reassignment",
  UndeclaredVariable = "undeclared" + varSuffix,
}

// Size rank for each type: higher means larger range. Bool is special (rank -1).

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
      return compileStatements(source, "", [], 0);
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
      for (const t of ["F64", "F32", "U32", "I32", "U16", "I16", "U8", "I8"]) {
        if (value.endsWith(t)) return t;
      }
      return undefined;
    })();
    if (literalType !== undefined) {
      srcType = literalType;
    }

    // Convert Tuff if/else to JS ternary before emitting
    const existingType = lookupType(varName);
    const assignResult = checkAssignable(
      srcType,
      declaredType !== undefined ? declaredType : existingType,
    );
    if (assignResult instanceof Err) return assignResult;

    // Record this variable's effective type for later lookups only if not already known
    if (existingType === undefined) {
      allVarTypes.push({ name: varName, type: declaredType ?? srcType ?? "" });
    }

    // Use 'let' for mutable vars, 'const' otherwise; bare reassignments omit the keyword
    code +=
      (isMutable ? "let" : existingType !== undefined ? "" : constKeyword) +
      varName +
      " = " +
      (() => {
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
        const rest = value.substring(condEnd + 1).trim();
        for (let i = 0; i < rest.length - 3; i++) {
          if (rest.substring(i, i + 4) === "else") {
            return (
              "(" +
              value.substring(conditionStart, condEnd) +
              ") ? (" +
              rest.substring(0, i).trim() +
              ") : (" +
              rest.substring(i + 4).trim() +
              ")"
            );
          }
        }
        return value;
      })() +
      "\n";
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

  // Helper: parse and emit a `let` declaration from the text after "let"
  function processLetDecl(
    restOfDeclInput: string,
  ): Ok<void> | Err<CompileError> {
    let rest = restOfDeclInput;
    let isMutable = false;
    if (rest.startsWith("mut ")) {
      isMutable = true;
      rest = rest.substring(4);
    }

    let varName: string;
    let declaredType: string | undefined;
    const colonPos = rest.indexOf(":");
    const eqPos = rest.indexOf("=");

    if (colonPos !== -1) {
      varName = rest.substring(0, colonPos).trim();
      declaredType = rest
        .substring(colonPos + 1, eqPos >= 0 ? eqPos : rest.length)
        .trim();
    } else {
      varName = rest.substring(0, eqPos).trim();
    }

    if (declaredVars.indexOf(varName) !== -1) {
      return new Err(CompileError.DuplicateVariable);
    }
    declaredVars.push(varName);

    if (isMutable) {
      mutVars.add(varName);
    }

    if (eqPos >= 0) {
      const assignResult = emitAssignment(
        varName,
        rest.substring(eqPos + 1).trim(),
        declaredType,
        isMutable,
      );
      if (assignResult instanceof Err) return assignResult;
    }

    return okVoid;
  }

  // Helper: emit a return statement with bool conversion when needed
  function emitReturn(exprToReturn: string): void {
    if (
      exprToReturn === boolTrue ||
      exprToReturn === boolFalse ||
      lookupType(exprToReturn) === "Bool" ||
      exprToReturn.includes("||") ||
      exprToReturn.includes("&&") ||
      isComparisonExpr(exprToReturn)
    ) {
      code += returnStr + "(+(" + exprToReturn + "))\n";
    } else {
      code += returnStr + exprToReturn + "\n";
    }
  }

  // Helper: check that a variable is mutable before reassignment, returns Err otherwise
  function ensureMutable(varName: string): Ok<void> | Err<CompileError> {
    if (!mutVars.has(varName)) {
      return new Err(CompileError.ImmutableReassignment);
    }
    return okVoid;
  }

  // Helper: process a bare reassignment statement like "x = value"
  function emitBareAssignment(stmtText: string): Ok<void> | Err<CompileError> {
    const eqPos = stmtText.indexOf("=");
    const targetVar = stmtText.substring(0, eqPos).trim();

    const mutCheck = ensureMutable(targetVar);
    if (mutCheck instanceof Err) return mutCheck;

    const assignResult = emitAssignment(
      targetVar,
      stmtText.substring(eqPos + 1).trim(),
      undefined,
      false,
    );
    if (assignResult instanceof Err) return assignResult;
    return okVoid;
  }

  function processBlockContent(
    blockBody: string,
  ): Ok<void> | Err<CompileError> {
    for (const stmt of blockBody.split(";")) {
      const stmtTrimmed = stmt.trim();
      if (stmtTrimmed === "") continue;
      const stmtLetIdx = stmtTrimmed.indexOf("let ");
      if (stmtLetIdx !== -1) {
        const letResult = processLetDecl(
          stmtTrimmed.substring(stmtLetIdx + "let ".length),
        );
        if (letResult instanceof Err) return letResult;
      } else if (stmtTrimmed.includes("=") && !isComparisonExpr(stmtTrimmed)) {
        const bareResult = emitBareAssignment(stmtTrimmed);
        if (bareResult instanceof Err) return bareResult;
      } else {
        emitReturn(stmtTrimmed);
      }
    }
    return okVoid;
  }

  // Split by semicolons while respecting brace nesting, then process each segment
  const segments: string[] = [];
  let currentSegment = "";
  let braceDepth = 0;

  function finishSegment(): void {
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
      currentSegment = "";
    }
  }

  for (const ch of expr) {
    if (ch === "{") {
      braceDepth++;
      currentSegment += ch;
    } else if (ch === "}") {
      braceDepth--;
      currentSegment += ch;
      // When closing back to depth 0, push what we have and start fresh
      if (braceDepth === 0) {
        finishSegment();
      }
    } else if (ch === ";" && braceDepth === 0) {
      finishSegment();
    } else {
      currentSegment += ch;
    }
  }

  // Push any remaining content after the last semicolon
  finishSegment();

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const trimmed = segments[segIdx]!.trim();

    if (trimmed === "") {
      code += defaultReturn + "\n";
      continue;
    }

    // Check if this is a let declaration or a bare assignment like "x = ..."
    const letIdx = trimmed.indexOf("let ");
    const endsWithCloseBrace = trimmed.endsWith("}");

    // Detect block statements: "{ ... }" — process contents but don't leak declarations outside
    if (trimmed.startsWith("{") && endsWithCloseBrace) {
      const blockResult = processBlockContent(
        trimmed.substring(1, trimmed.length - 1).trim(),
      );
      if (blockResult instanceof Err) return blockResult;
      declaredVars.length = 0;
      for (const v of [...declaredVars]) declaredVars.push(v);
      mutVars.clear();
      for (const v of new Set(mutVars)) mutVars.add(v);
      allVarTypes.length = allVarTypes.length;
      continue;
    }

    // Detect if/else statement blocks: "if (cond) { ... } [else { ... }]"
    const ifPrefix = "if (";
    if (trimmed.startsWith(ifPrefix) && endsWithCloseBrace) {
      let condDepth = 0;
      let condEnd = -1;
      for (let ci = ifPrefix.length - 1; ci < trimmed.length; ci++) {
        const ch = trimmed[ci];
        if (ch === "(") condDepth++;
        else if (ch === ")") {
          condDepth--;
          if (condDepth === 0) {
            condEnd = ci;
            break;
          }
        }
      }
      if (condEnd !== -1) {
        const blockPart = trimmed.substring(condEnd + 1).trim();
        if (blockPart.startsWith("{") && blockPart.endsWith("}")) {
          code +=
            ifPrefix + trimmed.substring(ifPrefix.length, condEnd) + ") {\n";
          const ifResult = processBlockContent(
            blockPart.substring(1, blockPart.length - 1),
          );
          if (ifResult instanceof Err) return ifResult;
          code += "}\n";
          const nextSeg = segments[segIdx + 1];
          if (nextSeg !== undefined) {
            const elseOpen = "else {";
            const nextTrimmed = nextSeg.trim();
            if (nextTrimmed.startsWith(elseOpen) && nextTrimmed.endsWith("}")) {
              code += elseOpen + "\n";
              const elseResult = processBlockContent(
                nextTrimmed.substring(elseOpen.length, nextTrimmed.length - 1),
              );
              if (elseResult instanceof Err) return elseResult;
              code += "}\n";
              segIdx++;
            }
          }
          continue;
        }
      }
    }

    if (letIdx !== -1) {
      // This is a `let` declaration at outer scope level
      const letResult = processLetDecl(
        trimmed.substring(letIdx + "let ".length),
      );
      if (letResult instanceof Err) return letResult;
    } else if (trimmed.includes("=") && !isComparisonExpr(trimmed)) {
      // Bare assignment: e.g. "x = read<U8>()" or "x = y"
      const bareResult = emitBareAssignment(trimmed);
      if (bareResult instanceof Err) return bareResult;
    } else {
      // Expression statement — treat as return. Handle bool literals and Bool-typed variables here too.
      const outerRetExpr = trimmed;

      // Check if this is a simple identifier that must be declared in scope
      let isSimpleIdentifier = true;
      for (let ci = 0; ci < outerRetExpr.length; ci++) {
        const c2 = outerRetExpr[ci]!;
        if (
          !(
            (c2 >= "a" && c2 <= "z") ||
            (c2 >= "A" && c2 <= "Z") ||
            (c2 >= "0" && c2 <= "9") ||
            c2 === "_"
          )
        ) {
          isSimpleIdentifier = false;
          break;
        }
      }
      if (isSimpleIdentifier && outerRetExpr.length > 0) {
        const firstCh = outerRetExpr[0]!;
        if (
          !(
            (firstCh >= "a" && firstCh <= "z") ||
            (firstCh >= "A" && firstCh <= "Z") ||
            firstCh === "_"
          )
        ) {
          isSimpleIdentifier = false;
        }
      }

      if (isSimpleIdentifier) {
        if (
          !declaredVars.includes(outerRetExpr) &&
          lookupType(outerRetExpr) === undefined
        ) {
          return new Err(CompileError.UndeclaredVariable);
        }
      }

      emitReturn(outerRetExpr);
    }
  }

  return new Ok(code);
}
