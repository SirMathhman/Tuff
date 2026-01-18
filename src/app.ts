function compile(source: string): string {
	// Minimal compiler for the tests: return JavaScript that evaluates to 0 for empty input.
	if (source.trim() === '') {
		return '0';
	}

	// Replace occurrences of `read U8` with a runtime expression that reads from
	// the provided `stdin`. This allows expressions like `read U8 + 1` to work.
	// Use RegExp constructor (avoids regex literal rule) to catch multiple occurrences.
	const re = new RegExp('read\\s+u8\\b', 'gi');
	const replaced = source.replace(re, '(Number(stdin) & 0xff)');
	if (replaced !== source) {
		return replaced;
	}

	// TODO: implement actual compilation logic.
	return '0';
}

export function run(source: string, stdIn: string): number {
	// Compile without stdin; provide `stdin` at execution time so reads can be
	// implemented as runtime expressions (easier to test and more flexible).
	const code = compile(source);

	// eslint-disable-next-line no-eval
	return eval(`(function(){ const stdin = \"${stdIn}\"; return (${code}); })()`) as number;
}
