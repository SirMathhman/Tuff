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
} | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("let ")) {
    return null;
  }
  const afterLet = trimmed.substring(4);
  const colonIndex = afterLet.indexOf(":");
  const equalIndex = afterLet.indexOf("=");

  if (equalIndex === -1) {
    return null;
  }

  let varName = "";
  let declaredType: string | null = null;
  let valueExpr = "";

  if (colonIndex !== -1 && colonIndex < equalIndex) {
    varName = afterLet.substring(0, colonIndex).trim();
    const afterColon = afterLet.substring(colonIndex + 1);
    const eqIdx = afterColon.indexOf("=");
    declaredType = afterColon.substring(0, eqIdx).trim();
    valueExpr = afterColon.substring(eqIdx + 1).trim();
  } else {
    varName = afterLet.substring(0, equalIndex).trim();
    valueExpr = afterLet.substring(equalIndex + 1).trim();
  }

  if (varName.length === 0 || valueExpr.length === 0) {
    return null;
  }

  return { varName, declaredType, valueExpr };
}

// eslint-disable-next-line no-unused-vars
type LetStatementCallback = (parsed: {
  varName: string;
  declaredType: string | null;
  valueExpr: string;
}) => void;

function forEachLetStatement(
  source: string,
  callback: LetStatementCallback,
): void {
  const lines = source.split(";").map((s) => s.trim());
  lines.forEach((line) => {
    const parsed = parseLetStatement(line);
    if (parsed) {
      callback(parsed);
    }
  });
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

function getExpressionType(expr: string): string | null {
  const trimmed = expr.trim();
  if (trimmed === "read U8") {
    return "U8";
  }
  if (trimmed === "read U16") {
    return "U16";
  }
  const isNum =
    trimmed.length > 0 && trimmed.split("").every((c) => c >= "0" && c <= "9");
  if (isNum) {
    const numVal = parseInt(trimmed, 10);
    if (numVal <= 255) {
      return "U8";
    }
    return "U16";
  }
  return null;
}

function validateTypeAssignments(source: string): void {
  const varTypes: { [key: string]: string } = {};
  forEachLetStatement(source, (parsed) => {
    let exprType: string | null = getExpressionType(parsed.valueExpr);

    // If not a literal or read expression, check if it's a variable
    if (!exprType && varTypes[parsed.valueExpr]) {
      exprType = varTypes[parsed.valueExpr];
    }

    if (parsed.declaredType && exprType) {
      if (parsed.declaredType !== exprType) {
        throw new Error(
          "Type mismatch: cannot assign " +
            exprType +
            " to " +
            parsed.declaredType,
        );
      }
    }

    if (exprType) {
      varTypes[parsed.varName] = exprType;
    }
  });
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
        if (trimmed === "read U8") {
          argCount.value = argCount.value + 1;
          return "parseInt(process.argv[" + (argCount.value + 1) + "], 10)";
        }
        if (trimmed.startsWith("(")) {
          return trimmed;
        }
        return trimmed;
      })
      .filter((t) => t.length > 0)
      .join(" ");
  };

  const tokens = tokenizeByOperators(source, ["+", "-"]);
  return tokens
    .map((token) => {
      if (token === "+" || token === "-") {
        return token;
      }
      return processMultDiv(token);
    })
    .filter((t) => t.length > 0)
    .join(" ");
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
      const compiledValue = compileExpression(parsed.valueExpr, argCount);
      compiledBlock =
        compiledBlock + "let " + parsed.varName + " = " + compiledValue + "; ";
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
    const parsed = parseVariableDeclaration(stmt);
    if (parsed) {
      const hasParens =
        parsed.valueExpr.includes("(") || parsed.valueExpr.includes("{");
      const processedValue = hasParens
        ? handleParentheses(parsed.valueExpr, argCount)
        : parsed.valueExpr;
      const compiledValue = compileExpression(processedValue, argCount);
      compiledBlock =
        compiledBlock + "let " + parsed.varName + " = " + compiledValue + "; ";
    }
  });

  compiledBlock = compiledBlock + "return " + finalPart + "; })()";

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
