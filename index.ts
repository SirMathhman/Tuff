export function evaluate(source: string): number {
  let s = source.trim();
  if (!s) return 0;

  // Pure statement ending with ";" and no trailing expression returns 0
  const lastSemicolon = s.lastIndexOf(";");
  if (lastSemicolon !== -1 && !s.slice(lastSemicolon + 1).trim()) {
    return 0;
  }

  // Resolve curly brace blocks (allow statements like "let" and ";")
  while (s.includes("{")) {
    const blockMatch = s.match(/\{([^{}]+)\}/);
    if (!blockMatch) break;
    s = s.replace(blockMatch[0]!, String(evaluate(blockMatch[1]!)));
  }

  // Resolve parentheses recursively — only pure expressions allowed (no "let" or ";")
  while (s.includes("(")) {
    const match = s.match(/\(([^()]+)\)/);
    if (!match) break;
    const inner = match[1]!;
    if (/;\b|^\s*let\b/.test(inner)) {
      throw new Error("Statements not allowed in parentheses");
    }
    s = s.replace(match[0]!, String(evaluate(inner)));
  }

  // Tokenize flat expression: numbers and operators
  const tokens = s.match(/(\d+|[+\-*/])/g)!;

  // First pass: resolve * and / (higher precedence)
  let terms: number[] = [parseInt(tokens[0], 10)];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]!;
    const num = parseInt(tokens[i + 1]!, 10);
    if (op === "*") terms.push(terms.pop()! * num);
    else if (op === "/") terms.push(terms.pop()! / num);
    else {
      // Push operator as negative number for later sum: "+" → push +num, "-" → push -num
      terms.push(op === "+" ? num : -num);
    }
  }

  return terms.reduce((sum, t) => sum + t, 0);
}
