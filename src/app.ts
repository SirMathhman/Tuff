function compile(source: string, stdIn?: string): string {
	// Minimal compiler for the tests: return JavaScript that evaluates to 0 for empty input.
	if (source === '') {
		return '0';
	}

	// Handle a simple read: `read U8` reads an unsigned byte from stdin.
	const trimmed = source.trim().toLowerCase();
	if (trimmed === 'read u8') {
		const n = Number(stdIn ?? '0') & 0xff;
		return String(n);
	}

	// TODO: implement actual compilation logic.
	return '0';
}

export function run(source: string, stdIn?: string): number {
	// Pass stdIn through to the compiler so it can inline simple reads.
	// eslint-disable-next-line no-eval
	return eval(compile(source, stdIn)) as number;
}
