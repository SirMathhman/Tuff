import {
	findMatchingBrace,
	isKeywordAt,
	parseIdentifier,
	skipWhitespaceInCode,
} from '../compiler-utils';

/**
 * Compiles module definitions and module-qualified calls to JavaScript.
 * - `module things { fn get() => 100; }` → `const things = { get: function get(){return (100);} };`
 * - `things::get()` → `things.get()`
 */

interface ModuleReplacement {
	text: string;
	nextIdx: number;
}

function tryReplaceModuleAt(code: string, idx: number): ModuleReplacement | undefined {
	let i = idx + 6;
	i = skipWhitespaceInCode(code, i);

	const name = parseIdentifier(code, i);
	if (name.length === 0) {
		return undefined;
	}

	i += name.length;
	i = skipWhitespaceInCode(code, i);
	if (i >= code.length || code[i] !== '{') {
		return undefined;
	}

	const bodyStart = i + 1;
	const bodyEnd = findMatchingBrace(code, i);
	const body = code.substring(bodyStart, bodyEnd - 1).trim();

	const fnNames = extractFunctionNames(body);
	const compiled = `const ${name} = { ${fnNames.map((n): string => `${n}: ${n}`).join(', ')} };`;

	return { text: body + compiled, nextIdx: bodyEnd };
}

function extractFunctionNames(body: string): string[] {
	const names: string[] = [];
	let i = 0;

	while (i < body.length) {
		if (!isKeywordAt(body, i, 'fn')) {
			i += 1;
			continue;
		}
		let j = i + 2;
		j = skipWhitespaceInCode(body, j);
		const name = parseIdentifier(body, j);
		if (name.length > 0) {
			names.push(name);
		}
		i += 1;
	}

	return names;
}

function replaceModuleDefinitions(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (!isKeywordAt(code, i, 'module')) {
			result += code[i];
			i += 1;
			continue;
		}

		const replacement = tryReplaceModuleAt(code, i);
		if (replacement === undefined) {
			result += code[i];
			i += 1;
			continue;
		}

		result += replacement.text;
		i = replacement.nextIdx;
	}

	return result;
}

function replaceModuleAccess(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (i + 1 < code.length && code[i] === ':' && code[i + 1] === ':') {
			result += '.';
			i += 2;
			continue;
		}

		result += code[i];
		i += 1;
	}

	return result;
}

export function compileModules(code: string): string {
	let result = replaceModuleDefinitions(code);
	result = replaceModuleAccess(result);
	return result;
}
