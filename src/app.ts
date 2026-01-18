import { Result, success, failure } from './result';

function compile(source: string): Result<string, string> {
	// Minimal compiler for the tests: return JavaScript that evaluates to 0 for empty input.
	if (source.trim() === '') {
		return success('0');
	}

	// Case-sensitive check for lowercase usage as requested.
	if (source.includes('read u8')) {
		return failure('Unexpected lowercase "read u8". Use "read U8" instead.');
	}

	// Replace occurrences of `read U8` with a runtime expression that reads from
	// the provided `stdin`. This allows expressions like `read U8 + 1` to work.
	// We avoid RegExp and regex literals as they are banned by lint rules.
	// Also replace { and } with ( and ) to handle custom grouping syntax.
	let replaced = source.split('{').join('(').split('}').join(')');
	const search = 'read U8';
	const replacement = '(Number(stdin.shift()) & 0xff)';

	let index = replaced.indexOf(search);

	while (index !== -1) {
		replaced = replaced.substring(0, index) + replacement + replaced.substring(index + search.length);
		index = replaced.indexOf(search);
	}

	if (replaced !== source) {
		return success(replaced);
	}

	return failure(`Unrecognized tokens in source: ${source}`);
}

export function run(source: string, stdIn: string): Result<number, string> {
	// Compile without stdin; provide `stdin` at execution time so reads can be
	// implemented as runtime expressions (easier to test and more flexible).
	const compilationResult = compile(source);
	if (!compilationResult.success) {
		return failure(compilationResult.error);
	}
	const code = compilationResult.value;

	const stdin = stdIn.split(' ').filter((s: string): boolean => {
		return s !== '';
	});
	void stdin;

	try {
		// eslint-disable-next-line no-eval
		const value = eval(`(function(stdin){ return (${code}); })(stdin)`) as number;
		return success(value);
	} catch (e) {
		return failure(String(e));
	}
}
