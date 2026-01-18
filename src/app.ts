import { Result, success, failure } from './result';

function wrapLetBindings(source: string): string {
	let replaced = source;
	let searchIndex = 0;
	while (searchIndex < replaced.length) {
		const letIndex = replaced.indexOf('let ', searchIndex);
		if (letIndex === -1) {
			break;
		}
		const eqIndex = replaced.indexOf('=', letIndex);
		const semiIndex = replaced.indexOf(';', eqIndex);
		if (eqIndex !== -1 && semiIndex !== -1) {
			const expr = replaced.substring(eqIndex + 1, semiIndex).trim();
			const before = replaced.substring(0, eqIndex + 1);
			const after = replaced.substring(semiIndex);
			replaced = `${before} (${expr} & 0xff) ${after}`;
			searchIndex = semiIndex + 10;
		} else {
			searchIndex = letIndex + 4;
		}
	}
	return replaced;
}

function handleLetBindings(source: string): string {
	let replaced = source;
	// Replace outer curly braces with IIFE wrapper
	replaced = replaced.split('{').join('(() => { ');
	replaced = replaced.split('}').join('})()');

	// Replace let x : U8 = expr; with let x = (expr & 0xff);
	replaced = wrapLetBindings(replaced);

	// Remove remaining type annotations if any
	replaced = replaced.split(': U8').join('');

	// Ensure the last identity expression in a block is returned.
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!replaced.includes(';')) {
		return replaced;
	}

	const blockEndIndex = replaced.lastIndexOf('})()');
	if (blockEndIndex === -1) {
		return replaced;
	}

	const beforeBlockEnd = replaced.substring(0, blockEndIndex);
	const afterBlockEnd = replaced.substring(blockEndIndex);
	const lastSemicolonIndex = beforeBlockEnd.lastIndexOf(';');

	if (lastSemicolonIndex === -1) {
		return replaced;
	}

	const segmentBeforeReturn = beforeBlockEnd.substring(0, lastSemicolonIndex + 1);
	const segmentToReturn = beforeBlockEnd.substring(lastSemicolonIndex + 1).trim();
	return `${segmentBeforeReturn} return ${segmentToReturn}; ${afterBlockEnd}`;
}

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
	// the provided `stdin`.
	let replaced = source;
	const search = 'read U8';
	// Just use a simpler replacement without declarations.
	const replacement = 'Number(stdin.shift())';

	let index = replaced.indexOf(search);
	while (index !== -1) {
		replaced = replaced.substring(0, index) + replacement + replaced.substring(index + search.length);
		index = replaced.indexOf(search);
	}

	// Handle `let x : U8 = expr;` inside `{}` by transforming it to JS.
	if (replaced.includes('let ')) {
		replaced = handleLetBindings(replaced);
	} else {
		// Standard curly brace replacement for simple grouping
		replaced = replaced.split('{').join('(').split('}').join(')');
	}

	return success(replaced);
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
		const value = eval(`(function(stdin){ return ((${code}) & 0xff); })(stdin)`) as number;
		return success(value);
	} catch (e) {
		return failure(`Evaluation error: ${String(e)}`);
	}
}
