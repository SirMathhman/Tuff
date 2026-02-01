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

export function compile(source: string): string {
  source = source.trim();

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
    source.includes("/")
  ) {
    let argCount = 0;

    const processMultDiv = (expr: string) => {
      const tokens = tokenizeByOperators(expr, ["*", "/"]);
      return tokens
        .map((token) => {
          if (token === "*" || token === "/") {
            return token;
          }
          const trimmed = token.trim();
          if (trimmed === "read U8") {
            argCount = argCount + 1;
            return "parseInt(process.argv[" + (argCount + 1) + "], 10)";
          }
          return trimmed;
        })
        .filter((t) => t.length > 0)
        .join(" ");
    };

    const tokens = tokenizeByOperators(source, ["+", "-"]);
    const processed = tokens
      .map((token) => {
        if (token === "+" || token === "-") {
          return token;
        }
        return processMultDiv(token);
      })
      .filter((t) => t.length > 0)
      .join(" ");

    return "process.exit(" + processed + ")";
  }

  // Default: exit with 0
  return "process.exit(0)";
}
