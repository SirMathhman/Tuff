export function interpret(input: string): number {
  const n = parseFloat(input);
  if (Number.isNaN(n)) {
    throw new Error("Invalid number");
  }
	if (n < 0) {
		throw new Error("Negative numbers are not supported");
	}
	return n;
}
