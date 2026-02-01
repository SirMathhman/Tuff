export function interpret(input: string): string {
  if (input.endsWith("U8")) {
    return input.slice(0, -2);
  }
  return input;
}

console.log("Hello from TypeScript!");
