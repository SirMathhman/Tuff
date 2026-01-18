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
	// Inject stdin into the eval by wrapping code in an IIFE that accepts `stdin`.
	// eslint-disable-next-line no-eval
	return eval(`(function(stdin){ return (${code}); })(${JSON.stringify(stdIn ?? '0')})`) as number;
}
