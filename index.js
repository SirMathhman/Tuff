export function execute(source) {
  if (!source || source.trim().length === 0) return 0;
  const trimmed = source.trim();

  // Try simple integer first
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);

  // Tokenize: numbers and operators (+, -, *, /)
  const tokens = trimmed.match(/\d+|[+\-*/]/g);
  if (!tokens || !/^\d+$/.test(tokens[0]))
    throw new Error("Invalid source: " + source);

  // Build list of {value, op} for evaluation with precedence
  // First pass: handle * and / (higher precedence)
  const stack = [parseInt(tokens[0], 10)];

  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const numStr = tokens[i + 1];
    if (!numStr || !/^\d+$/.test(numStr))
      throw new Error("Invalid source: " + source);
    const num = parseInt(numStr, 10);

    if (op === "*") {
      stack.push(stack.pop() * num);
    } else if (op === "/") {
      stack.push(stack.pop() / num);
    } else if (op === "+" || op === "-") {
      stack.push(op);
      stack.push(num);
    }
  }

  // Second pass: handle + and - (left to right)
  let result = stack[0];
  for (let i = 1; i < stack.length; i += 2) {
    const op = stack[i];
    const num = stack[i + 1];
    if (op === "+") {
      result += num;
    } else if (op === "-") {
      result -= num;
    }
  }

  return result;
}
