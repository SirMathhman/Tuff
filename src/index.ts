type Result<T, E> = { success: true; data: T } | { success: false; error: E };

export function interpret(input: string): Result<number, string> {
  if (input.endsWith("U8")) {
    if (input.startsWith("-")) {
      return { success: false, error: "Negative numbers cannot have U8 suffix" };
    }
    return { success: true, data: Number(input.slice(0, -2)) };
  }
  return { success: true, data: Number(input) };
}
  
console.log("Hello from TypeScript!");
