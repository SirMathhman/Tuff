import { ok, type Result } from '../common/result';

/**
 * Converts Tuff type annotation to JavaScript code for parsing stdin.
 */
function compileReadFunction(typeAnnotation: string): string {
	const type = typeAnnotation.trim();
	if (type === 'I32' || type === 'i32') {
		// Use synchronous file reading to get stdin
		return "parseInt(require('fs').readFileSync(0, 'utf-8').trim(), 10)";
	}
	return `(() => { throw new Error('Unsupported type: ${type}'); })()`;
}

/**
 * Compiles Tuff source code to JavaScript.
 *
 * @param input - The Tuff source code to compile
 * @returns A Result containing the compiled JavaScript code or an error
 */
export function compile(input: string): Result<string> {
	let jsCode = input;

	// Replace read<T>() calls with JavaScript code to read from stdin
	const readStart = 'read<';
	let current = 0;
	let output = '';

	while (current < jsCode.length) {
		const idx = jsCode.indexOf(readStart, current);
		if (idx === -1) {
			output = output + jsCode.substring(current);
			break;
		}

		output = output + jsCode.substring(current, idx);
		const afterRead = idx + readStart.length;
		const closeIdx = jsCode.indexOf('>()', afterRead);
		if (closeIdx === -1) {
			output = output + jsCode.substring(idx);
			break;
		}

		const type = jsCode.substring(afterRead, closeIdx);
		output = output + compileReadFunction(type);
		current = closeIdx + 3;
	}

	jsCode = output;

	// If the code contains read<...>(), set exit code to result, otherwise set to 0
	if (input.includes('read<')) {
		jsCode = `process.exitCode = ${jsCode};`;
	} else {
		jsCode = `${jsCode}; process.exitCode = 0;`;
	}

	return ok(jsCode);
}
