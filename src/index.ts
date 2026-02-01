type Result<T, E> = { success: true; data: T } | { success: false; error: E };

export function interpret(input: string): Result<number, string> {
  if (input.endsWith("U8")) {
    if (input.startsWith("-")) {
      return { success: false, error: "Negative numbers cannot have U8 suffix" };
    }
    const value = Number(input.slice(0, -2));
    if (value > 255) {
      return { success: false, error: "Number exceeds U8 range (0-255)" };
    }
    return { success: true, data: value };
  }
  return { success: true, data: Number(input) };
}
  
console.log("Hello from TypeScript!");
