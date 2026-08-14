export function interpret(input: string): number {
  if (input === "") return 0;

  // Tokenize into numbers and operators
  const tokens = input
    .split(/(\+|-|\*|\/)/)
    .map((s) => s.trim())
    .filter((s) => s !== "");

  // Pass 1: evaluate * and / (high precedence)
  const reduced: number[] = [Number(tokens[0])];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const num = Number(tokens[i + 1]);
    if (op === "*") {
      reduced[reduced.length - 1]! *= num;
    } else if (op === "/") {
      reduced[reduced.length - 1]! /= num;
    } else {
      reduced.push(op === "+" ? num : -num);
    }
  }

  // Pass 2: evaluate + and - (low precedence)
  return reduced.reduce((a, b) => a + b, 0);
}

console.log("Hello via Bun!");
