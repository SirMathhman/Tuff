export function compileTuffToTS(input: string): string {
  if (input.trim() === "") {
    return "return 0;";
  }
  if (input.trim() === "read<U8>()") {
    return "return Number(stdIn);";
  }
  if (input.trim() === "read<U16>()") {
    return "return Number(stdIn);";
  }
  if (input.trim() === "read<U32>()") {
    return "return Number(stdIn);";
  }
  throw new Error("Invalid input: " + input);
}