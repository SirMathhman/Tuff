export function interpret(input: string): number {
	const n = parseFloat(input);
	if (Number.isNaN(n)) {
		throw new Error("Invalid number");
	}
	return n;
}
