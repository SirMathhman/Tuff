function compile(source: string): string {
	// Minimal compiler for the tests: return JavaScript that evaluates to 0 for empty input.
	if (source === '') {
		return '0';
	}

	// Handle a simple read: `read U8` compiles to an expression that reads from a
	// runtime `stdin` parameter (the caller decides how to provide it).
	const trimmed = source.trim().toLowerCase();
	if (trimmed === 'read u8') {
		return 'Number(stdin) & 0xff';
	}

	// TODO: implement actual compilation logic.
	return '0';
}

export function run(source: string, stdIn?: string): number {
	// Compile without stdin; provide `stdin` at execution time so reads can be
	// implemented as runtime expressions (easier to test and more flexible).
	const code = compile(source);
	// Use the Function constructor to inject `stdin` at runtime.
	// eslint-disable-next-line no-new-func
	const fn = new Function('stdin', `return (${code});`);
	return fn(stdIn ?? '0') as number;
}
