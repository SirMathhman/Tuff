function tokenizeByOperators(expr: string, operators: string[]): string[] {
  const chars = expr.split("");
  const result = chars.reduce(
    (acc, char) => {
      const isOperator = operators.includes(char);
      if (isOperator) {
        return {
          tokens: acc.tokens.concat([acc.current, char]),
          current: "",
        };
      }
      return {
        tokens: acc.tokens,
        current: acc.current + char,
      };
    },
    { tokens: [] as string[], current: "" },
  );

  if (result.current.trim().length > 0) {
    result.tokens.push(result.current);
  }

  return result.tokens;
}

function validateNoZeroDivision(source: string): void {
  if (source.includes("/ 0") || source.includes("/0")) {
    throw new Error("Division by zero detected at compile time");
  }
}

function parseLetStatement(line: string): {
  varName: string;
  declaredType: string | null;
  valueExpr: string;
  isMutable: boolean;
} | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("let ")) {
    return null;
  }
  let afterLet = trimmed.substring(4);
  let isMutable = false;

  // Check for "mut" keyword
  if (afterLet.startsWith("mut ")) {
    isMutable = true;
    afterLet = afterLet.substring(4);
  }

  const colonIndex = afterLet.indexOf(":");
  const equalIndex = afterLet.indexOf("=");

  let varName = "";
  let declaredType: string | null = null;
  let valueExpr = "";

  if (colonIndex !== -1) {
    // Has type annotation
    varName = afterLet.substring(0, colonIndex).trim();
    const afterColon = afterLet.substring(colonIndex + 1);

    if (equalIndex === -1) {
      // No initialization: let x : I32;
      declaredType = afterColon.trim();
      valueExpr = "";
    } else {
      // Has initialization: let x : I32 = ...
      const eqIdx = afterColon.indexOf("=");
      declaredType = afterColon.substring(0, eqIdx).trim();
      valueExpr = afterColon.substring(eqIdx + 1).trim();
    }
  } else {
    // No type annotation
    if (equalIndex === -1) {
      return null;
    }
    varName = afterLet.substring(0, equalIndex).trim();
    valueExpr = afterLet.substring(equalIndex + 1).trim();
  }

  if (varName.length === 0) {
    return null;
  }

  if (!declaredType && valueExpr.length === 0) {
    return null;
  }

  const convertedExpr = convertIfElseToTernary(valueExpr);
  return { varName, declaredType, valueExpr: convertedExpr, isMutable };
}

type LetStatementCallback = (parsed: {
  varName: string;
  declaredType: string | null;
  valueExpr: string;
  isMutable: boolean;
}) => void;

function parseReassignmentStatement(line: string): {
  varName: string;
  valueExpr: string;
} | null {
  const trimmed = line.trim();
  const equalIndex = trimmed.indexOf("=");

  if (equalIndex === -1) {
    return null;
  }

  const varName = trimmed.substring(0, equalIndex).trim();
  const valueExpr = trimmed.substring(equalIndex + 1).trim();

  if (varName.length === 0 || valueExpr.length === 0) {
    return null;
  }

  // Only match simple identifiers (no spaces, no operators before =)
  const isSimpleId = varName
    .split("")
    .every(
      (c) =>
        (c >= "a" && c <= "z") ||
        (c >= "A" && c <= "Z") ||
        (c >= "0" && c <= "9") ||
        c === "_",
    );

  if (!isSimpleId) {
    return null;
  }

  return { varName, valueExpr };
}

type StatementParser<T> = (_line: string) => T | null;

function forEachStatement<T>(
  source: string,
  parser: StatementParser<T>,
  callback: (parsed: T) => void,
): void {
  const lines = source.split(";").map((s) => s.trim());
  lines.forEach((_line) => {
    const parsed = parser(_line);
    if (parsed) {
      callback(parsed);
    }
  });
}

function forEachLetStatement(
  source: string,
  callback: LetStatementCallback,
): void {
  forEachStatement(source, parseLetStatement, callback);
}

function findLetStatementEnd(source: string, startIndex: number): number {
  const restOfSource = source.substring(startIndex);
  const semicolonIndex = restOfSource.indexOf(";");
  const openBraceIndex = restOfSource.indexOf("{");

  if (semicolonIndex === -1 && openBraceIndex === -1) {
    return restOfSource.length;
  }
  if (semicolonIndex === -1) {
    return openBraceIndex;
  }
  if (openBraceIndex === -1) {
    return semicolonIndex;
  }
  return Math.min(semicolonIndex, openBraceIndex);
}

function findBlockEnd(source: string, startIndex: number): number {
  let depth = 1;
  let current = startIndex + 1;
  // eslint-disable-next-line no-restricted-syntax
  while (current < source.length && depth > 0) {
    if (source[current] === "{") depth = depth + 1;
    if (source[current] === "}") depth = depth - 1;
    current = current + 1;
  }
  return current;
}

function extractAllLetStatements(source: string): string[] {
  const vars: string[] = [];
  let i = 0;
  const chars = source.split("");

  // eslint-disable-next-line no-restricted-syntax
  while (i < chars.length) {
    if (
      i + 3 < chars.length &&
      chars[i] === "l" &&
      chars[i + 1] === "e" &&
      chars[i + 2] === "t" &&
      chars[i + 3] === " "
    ) {
      const endIndex = findLetStatementEnd(source, i);
      const statement = source.substring(i, i + endIndex).trim();
      const parsed = parseLetStatement(statement);
      if (parsed) {
        vars.push(parsed.varName);
      }

      i = i + 4;
    } else if (chars[i] === "{") {
      const blockEnd = findBlockEnd(source, i);
      const blockContents = source.substring(i + 1, blockEnd - 1);
      const innerVars = extractAllLetStatements(blockContents);
      vars.push(...innerVars);

      i = blockEnd;
    } else {
      i = i + 1;
    }
  }

  return vars;
}

function validateNoDuplicateVariables(source: string): void {
  const allVars = extractAllLetStatements(source);
  const seen: string[] = [];
  allVars.forEach((varName) => {
    if (seen.includes(varName)) {
      throw new Error("Duplicate variable declaration: " + varName);
    }
    seen.push(varName);
  });
}

function convertIfElseToTernary(expr: string): string {
  const trimmed = expr.trim();
  if (!trimmed.startsWith("if ")) {
    return expr;
  }

  const chars = trimmed.split("");
  const openParenIdx = trimmed.indexOf("(");
  if (openParenIdx === -1) {
    return expr;
  }

  const search = chars.reduce(
    (acc, char, i) => {
      if (acc.condEnd !== -1 || i <= openParenIdx) {
        return acc;
      }
      if (char === "(") {
        return { depth: acc.depth + 1, condEnd: acc.condEnd };
      }
      if (char === ")") {
        const nextDepth = acc.depth - 1;
        if (nextDepth === 0) {
          return { depth: nextDepth, condEnd: i };
        }
        return { depth: nextDepth, condEnd: acc.condEnd };
      }
      return acc;
    },
    { depth: 1, condEnd: -1 },
  );
  const condEnd = search.condEnd;

  if (condEnd === -1) {
    return expr;
  }

  const condition = trimmed.substring(openParenIdx + 1, condEnd);
  const afterCond = trimmed.substring(condEnd + 1).trim();

  const elseIdx = afterCond.indexOf(" else ");
  if (elseIdx === -1) {
    return expr;
  }

  const trueValue = afterCond.substring(0, elseIdx).trim();
  const falseValue = afterCond.substring(elseIdx + 6).trim();

  return "(" + condition + ") ? " + trueValue + " : " + falseValue;
}

function getExpressionType(expr: string): string | null {
  const trimmed = expr.trim();
  if (trimmed === "read U8") {
    return "U8";
  }
  if (trimmed === "read U16") {
    return "U16";
  }
  if (trimmed === "read I32") {
    return "I32";
  }
  if (trimmed === "read Bool") {
    return "Bool";
  }
  const isNum =
    trimmed.length > 0 && trimmed.split("").every((c) => c >= "0" && c <= "9");
  if (isNum) {
    const numVal = parseInt(trimmed, 10);
    if (numVal <= 255) {
      return "U8";
    }
    if (numVal <= 65535) {
      return "U16";
    }
    return "I32";
  }
  return null;
}

function resolveExpressionType(
  expr: string,
  varTypes: { [key: string]: string },
): string | null {
  let exprType: string | null = getExpressionType(expr);
  if (!exprType && varTypes[expr]) {
    exprType = varTypes[expr];
  }
  return exprType;
}

function collectVariableInfo(source: string): {
  varTypes: { [key: string]: string };
  varMutability: { [key: string]: boolean };
} {
  const varTypes: { [key: string]: string } = {};
  const varMutability: { [key: string]: boolean } = {};

  forEachLetStatement(source, (parsed) => {
    let varType: string | null = null;

    if (parsed.declaredType) {
      varType = parsed.declaredType;
    } else if (parsed.valueExpr.length > 0) {
      varType = resolveExpressionType(parsed.valueExpr, varTypes);
    }

    if (varType) {
      varTypes[parsed.varName] = varType;
      varMutability[parsed.varName] = parsed.isMutable;
    }
  });

  return { varTypes, varMutability };
}

function collectDeclaredTypes(source: string): { [key: string]: string } {
  const declaredTypes: { [key: string]: string } = {};

  forEachLetStatement(source, (parsed) => {
    if (parsed.declaredType) {
      declaredTypes[parsed.varName] = parsed.declaredType;
    }
  });

  return declaredTypes;
}

function validateTypeAssignments(source: string): void {
  const { varTypes } = collectVariableInfo(source);
  forEachLetStatement(source, (parsed) => {
    if (!parsed.declaredType) {
      return;
    }

    const exprType = resolveExpressionType(parsed.valueExpr, varTypes);

    if (exprType && parsed.declaredType !== exprType) {
      throw new Error(
        "Type mismatch: cannot assign " +
          exprType +
          " to " +
          parsed.declaredType,
      );
    }
  });
}

function forEachReassignment(
  source: string,
  callback: (reassignment: { varName: string; valueExpr: string }) => void,
): void {
  forEachStatement(source, parseReassignmentStatement, callback);
}

function validateReassignmentTypes(source: string): void {
  const { varTypes } = collectVariableInfo(source);
  const declaredTypes = collectDeclaredTypes(source);

  forEachReassignment(source, (reassignment) => {
    const varName = reassignment.varName;

    // Only check type mismatches for variables with explicit type declarations
    if (!declaredTypes[varName]) {
      return;
    }

    const exprType = resolveExpressionType(reassignment.valueExpr, varTypes);

    if (exprType && declaredTypes[varName] !== exprType) {
      throw new Error(
        "Type mismatch: cannot assign " +
          exprType +
          " to " +
          declaredTypes[varName],
      );
    }
  });
}

function collectUninitializedVariables(source: string): Set<string> {
  const uninitialized = new Set<string>();

  forEachLetStatement(source, (parsed) => {
    if (parsed.valueExpr.length === 0) {
      uninitialized.add(parsed.varName);
    }
  });

  return uninitialized;
}

function validateUninitializedVariableUsage(source: string): void {
  const uninitializedVars = collectUninitializedVariables(source);

  if (uninitializedVars.size === 0) {
    return;
  }

  // Split into top-level statements
  const statements = splitTopLevelStatements(source);
  const assignedVars = new Set<string>();

  // Check each statement in order
  statements.forEach((stmt) => {
    // Skip let statements (they're declarations, not uses)
    if (stmt.trim().startsWith("let ")) {
      return;
    }

    // Check if this is an assignment to an uninitialized variable
    const reassignParsed = parseReassignmentStatement(stmt);
    if (reassignParsed) {
      assignedVars.add(reassignParsed.varName);
      // Don't need to check further since it's an assignment
      return;
    }

    // Check if this statement uses any uninitialized variables
    Array.from(uninitializedVars).forEach((varName) => {
      if (!assignedVars.has(varName) && stmt.includes(varName)) {
        throw new Error("Cannot use uninitialized variable: " + varName);
      }
    });
  });

  // Check the final expression (after the last semicolon)
  const lastSemicolon = source.lastIndexOf(";");
  if (lastSemicolon !== -1) {
    const finalExpr = source.substring(lastSemicolon + 1).trim();
    Array.from(uninitializedVars).forEach((varName) => {
      if (!assignedVars.has(varName) && finalExpr.includes(varName)) {
        throw new Error("Cannot use uninitialized variable: " + varName);
      }
    });
  }
}

function validateReassignments(source: string): void {
  const { varTypes, varMutability } = collectVariableInfo(source);
  const uninitializedVars = collectUninitializedVariables(source);

  forEachReassignment(source, (reassignment) => {
    const varName = reassignment.varName;

    // Check if variable exists
    if (!varTypes[varName]) {
      throw new Error("Cannot reassign undeclared variable: " + varName);
    }

    // Check if variable is mutable (or uninitialized)
    if (!varMutability[varName] && !uninitializedVars.has(varName)) {
      throw new Error("Cannot reassign immutable variable: " + varName);
    }
  });
}

function compileReadExpression(
  trimmed: string,
  argCount: { value: number },
): string {
  if (
    trimmed === "read U8" ||
    trimmed === "read U16" ||
    trimmed === "read I32"
  ) {
    argCount.value = argCount.value + 1;
    return "parseInt(process.argv[" + (argCount.value + 1) + "], 10)";
  }
  if (trimmed === "read Bool") {
    argCount.value = argCount.value + 1;
    return "(process.argv[" + (argCount.value + 1) + '] === "true" ? 1 : 0)';
  }
  return trimmed;
}

function compileExpression(
  source: string,
  argCount: { value: number },
): string {
  const processMultDiv = (expr: string) => {
    const tokens = tokenizeByOperators(expr, ["*", "/"]);
    return tokens
      .map((token) => {
        if (token === "*" || token === "/") {
          return token;
        }
        const trimmed = token.trim();
        if (trimmed.startsWith("(")) {
          return trimmed;
        }
        return compileReadExpression(trimmed, argCount);
      })
      .filter((t) => t.length > 0)
      .join(" ");
  };

  const tokens = tokenizeByOperators(source, ["+", "-"]);
  const result = tokens
    .map((token) => {
      if (token === "+" || token === "-") {
        return token;
      }
      return processMultDiv(token);
    })
    .filter((t) => t.length > 0)
    .join(" ");

  // Check if result contains comparison operators and wrap appropriately
  const trimmedResult = result.trim();
  if (
    trimmedResult.includes(" < ") ||
    trimmedResult.includes(" > ") ||
    trimmedResult.includes(" <= ") ||
    trimmedResult.includes(" >= ")
  ) {
    return "(" + trimmedResult + " ? 1 : 0)";
  }

  return result;
}

function parseVariableDeclaration(
  decl: string,
): { varName: string; valueExpr: string } | null {
  const parsed = parseLetStatement(decl);
  if (!parsed) {
    return null;
  }
  return { varName: parsed.varName, valueExpr: parsed.valueExpr };
}

function compileVariableBlock(
  innerExpr: string,
  argCount: { value: number },
): string {
  const statements = innerExpr
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (statements.length === 0) {
    return "";
  }
  const lastStatement = statements[statements.length - 1];
  const varDeclarations = statements.slice(0, -1);

  let compiledBlock = "(() => { ";
  varDeclarations.forEach((decl) => {
    const parsed = parseVariableDeclaration(decl);
    if (parsed) {
      if (parsed.valueExpr.length === 0) {
        // Uninitialized variable: just declare it
        compiledBlock = compiledBlock + "let " + parsed.varName + "; ";
      } else {
        const compiledValue = compileExpression(parsed.valueExpr, argCount);
        compiledBlock =
          compiledBlock +
          "let " +
          parsed.varName +
          " = " +
          compiledValue +
          "; ";
      }
    }
  });

  const compiledLast = compileExpression(lastStatement, argCount);
  compiledBlock = compiledBlock + "return " + compiledLast + "; })()";
  return compiledBlock;
}

function splitTopLevelStatements(source: string): string[] {
  const result: string[] = [];
  let current = "";
  let depth = 0;
  const chars = source.split("");

  chars.forEach((char) => {
    if ((char === "(" || char === "{") && depth >= 0) {
      depth = depth + 1;
      current = current + char;
    } else if ((char === ")" || char === "}") && depth > 0) {
      depth = depth - 1;
      current = current + char;
    } else if (char === ";" && depth === 0) {
      if (current.trim().length > 0) {
        result.push(current.trim());
      }
      current = "";
    } else {
      current = current + char;
    }
  });

  if (current.trim().length > 0) {
    result.push(current.trim());
  }

  return result;
}

function compileReassignment(
  reassign: { varName: string; valueExpr: string },
  argCount: { value: number },
): string {
  const hasParens =
    reassign.valueExpr.includes("(") || reassign.valueExpr.includes("{");
  const processedValue = hasParens
    ? handleParentheses(reassign.valueExpr, argCount)
    : reassign.valueExpr;
  const compiledValue = compileExpression(processedValue, argCount);
  return reassign.varName + " = " + compiledValue + "; ";
}

function compileTopLevelStatement(
  stmt: string,
  argCount: { value: number },
): string {
  // Handle statement blocks { ... }
  if (stmt.startsWith("{") && stmt.endsWith("}")) {
    const blockContent = stmt.substring(1, stmt.length - 1).trim();
    const blockStatements = blockContent
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let blockCode = "";
    Array.from(blockStatements).forEach((s) => {
      const reassignParsed = parseReassignmentStatement(s);
      if (reassignParsed) {
        blockCode = blockCode + compileReassignment(reassignParsed, argCount);
      }
    });
    return blockCode;
  }

  const letParsed = parseVariableDeclaration(stmt);
  if (letParsed) {
    if (letParsed.valueExpr.length === 0) {
      // Uninitialized variable: just declare it
      return "let " + letParsed.varName + "; ";
    } else {
      const hasParens =
        letParsed.valueExpr.includes("(") || letParsed.valueExpr.includes("{");
      const processedValue = hasParens
        ? handleParentheses(letParsed.valueExpr, argCount)
        : letParsed.valueExpr;
      const compiledValue = compileExpression(processedValue, argCount);
      return "let " + letParsed.varName + " = " + compiledValue + "; ";
    }
  }

  const reassignParsed = parseReassignmentStatement(stmt);
  if (reassignParsed) {
    return compileReassignment(reassignParsed, argCount);
  }

  return "";
}

function compileTopLevelVariableBlock(
  source: string,
  argCount: { value: number },
): string | null {
  if (!source.startsWith("let ")) {
    return null;
  }

  const lastSemicolon = source.lastIndexOf(";");
  if (lastSemicolon === -1) {
    return null;
  }

  const blockPart = source.substring(0, lastSemicolon);
  const finalPart = source.substring(lastSemicolon + 1).trim();

  const statements = splitTopLevelStatements(blockPart);

  let compiledBlock = "(() => { ";

  statements.forEach((stmt) => {
    compiledBlock = compiledBlock + compileTopLevelStatement(stmt, argCount);
  });

  const compiledFinalPart = compileExpression(finalPart, argCount);
  compiledBlock = compiledBlock + "return " + compiledFinalPart + "; })()";

  return compiledBlock;
}

function handleParentheses(
  source: string,
  argCount: { value: number },
): string {
  const chars = source.split("");
  const result = chars.reduce(
    (acc, char, i) => {
      if (acc.skip > 0) {
        return {
          result: acc.result,
          skip: acc.skip - 1,
        };
      }

      if (char === "(" || char === "{") {
        const closingBrace = char === "(" ? ")" : "}";
        let depth = 1;
        let j = i + 1;
        // eslint-disable-next-line no-restricted-syntax
        while (j < chars.length && depth > 0) {
          if (chars[j] === char) depth = depth + 1;
          if (chars[j] === closingBrace) depth = depth - 1;
          j = j + 1;
        }
        const innerExpr = source.substring(i + 1, j - 1);

        let compiled = "";
        if (char === "{" && innerExpr.includes("let ")) {
          compiled = compileVariableBlock(innerExpr, argCount);
        } else {
          const processed = handleParentheses(innerExpr, argCount);
          compiled = compileExpression(processed, argCount);
        }

        return {
          result: acc.result + "(" + compiled + ")",
          skip: j - i - 1,
        };
      }

      return {
        result: acc.result + char,
        skip: 0,
      };
    },
    { result: "", skip: 0 },
  );

  return result.result;
}

export function compile(source: string): string {
  source = source.trim();

  validateNoZeroDivision(source);
  validateNoDuplicateVariables(source);
  validateTypeAssignments(source);
  validateReassignmentTypes(source);
  validateReassignments(source);
  validateUninitializedVariableUsage(source);

  // Top-level variable declarations
  if (source.startsWith("let ")) {
    const argCount = { value: 0 };
    const compiled = compileTopLevelVariableBlock(source, argCount);
    if (compiled) {
      return "process.exit(" + compiled + ")";
    }
  }

  // Simple number literal
  const isNumber =
    source.length > 0 && source.split("").every((c) => c >= "0" && c <= "9");
  if (isNumber) {
    return "process.exit(" + source + ")";
  }

  // Read U8 instruction
  if (source === "read U8") {
    return "process.exit(parseInt(process.argv[2], 10))";
  }

  // Read Bool instruction
  if (source === "read Bool") {
    return 'process.exit(process.argv[2] === "true" ? 1 : 0)';
  }

  // Arithmetic operations with read U8 and mixed operators
  if (
    source.includes("+") ||
    source.includes("-") ||
    source.includes("*") ||
    source.includes("/") ||
    source.includes("(") ||
    source.includes(")") ||
    source.includes("{") ||
    source.includes("}")
  ) {
    const argCount = { value: 0 };
    const processed =
      source.includes("(") || source.includes("{")
        ? compileExpression(handleParentheses(source, argCount), argCount)
        : compileExpression(source, argCount);
    return "process.exit(" + processed + ")";
  }

  // Default: exit with 0
  return "process.exit(0)";
}
