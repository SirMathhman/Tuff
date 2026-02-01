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
  const declTrimmed = decl.trim();
  if (!declTrimmed.startsWith("let ")) {
    return null;
  }
  const afterLet = declTrimmed.substring(4);
  const colonIndex = afterLet.indexOf(":");
  const equalIndex = afterLet.indexOf("=");

  if (equalIndex === -1) {
    return null;
  }

  let varName = "";
  let valueExpr = "";

  if (colonIndex !== -1 && colonIndex < equalIndex) {
    // Format: let x : Type = expr
    varName = afterLet.substring(0, colonIndex).trim();
    valueExpr = afterLet.substring(equalIndex + 1).trim();
  } else {
    // Format: let x = expr
    varName = afterLet.substring(0, equalIndex).trim();
    valueExpr = afterLet.substring(equalIndex + 1).trim();
  }

  if (varName.length === 0 || valueExpr.length === 0) {
    return null;
  }

  return { varName, valueExpr };
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

  const parsed = parseVariableDeclaration(blockPart);
  if (!parsed) {
    return null;
  }

  const hasParens =
    parsed.valueExpr.includes("(") || parsed.valueExpr.includes("{");
  const processedValue = hasParens
    ? handleParentheses(parsed.valueExpr, argCount)
    : parsed.valueExpr;
  const compiledValue = compileExpression(processedValue, argCount);
  let compiledBlock =
    "(() => { let " +
    parsed.varName +
    " = " +
    compiledValue +
    "; return " +
    finalPart +
    "; })()";

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
