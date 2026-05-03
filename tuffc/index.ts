export function compileTuffToTS(input: string): string {
  if (input.trim() === "") {
    return "return 0;";
  }
  throw new Error("Invalid input: " + input);
}