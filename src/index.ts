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
        const processed = handleParentheses(innerExpr, argCount);
        const compiled = compileExpression(processed, argCount);
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

  // Convert curly braces to parentheses
  source = source.split("{").join("(").split("}").join(")");

  validateNoZeroDivision(source);

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
    source.includes(")")
  ) {
    const argCount = { value: 0 };
    const processed = source.includes("(")
      ? compileExpression(handleParentheses(source, argCount), argCount)
      : compileExpression(source, argCount);
    return "process.exit(" + processed + ")";
  }

  // Default: exit with 0
  return "process.exit(0)";
}
