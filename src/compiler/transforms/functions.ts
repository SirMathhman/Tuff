import {
	findMatchingParen,
	isKeywordAt,
	parseIdentifier,
	skipWhitespaceInCode,
} from '../compiler-utils';

interface FunctionReplacement {
	text: string;
	nextIdx: number;
}

interface ParsedFunctionHeader {
	name: string;
	paramsJs: string;
	bodyStart: number;
}

function isWhitespace(ch: string): boolean {
	return ch === ' ' || ch === '\t' || ch === '\n';
}

function splitTopLevelParams(params: string): string[] {
	const result: string[] = [];
	let i = 0;
	let start = 0;
	let depth = 0;

	while (i < params.length) {
		const ch = params[i];
		if (ch === '(') {
			depth += 1;
		} else if (ch === ')') {
			depth -= 1;
		} else if (ch === ',' && depth === 0) {
			result.push(params.substring(start, i));
			start = i + 1;
		}
		i += 1;
	}

	result.push(params.substring(start));
	return result;
}

function compileParamsToJs(params: string): string {
	const trimmed = params.trim();
	if (trimmed.length === 0) {
		return '';
	}

	const parts = splitTopLevelParams(params);
	const compiled: string[] = [];
	for (const part of parts) {
		const piece = part.trim();
		if (piece.length === 0) {
			continue;
		}

		const colonIdx = piece.indexOf(':');
		if (colonIdx < 0) {
			compiled.push(piece);
			continue;
		}

		compiled.push(piece.substring(0, colonIdx).trim());
	}

	return compiled.join(', ');
}

function decrementDepth(depth: number): number {
	if (depth > 0) {
		return depth - 1;
	}
	return depth;
}

function incrementDepth(depth: number): number {
	return depth + 1;
}

function skipQuotedString(code: string, startIdx: number): number {
	const quote = code[startIdx];
	let i = startIdx + 1;
	while (i < code.length) {
		if (code[i] === quote && code[i - 1] !== '\\') {
			return i + 1;
		}
		i += 1;
	}
	return i;
}

function findFunctionBodyEnd(code: string, startIdx: number): number {
	let i = startIdx;
	let parenDepth = 0;
	let braceDepth = 0;
	let bracketDepth = 0;

	while (i < code.length) {
		const ch = code[i];
		if (ch === '"' || ch === "'" || ch === '`') {
			i = skipQuotedString(code, i);
			continue;
		}
		if (ch === '(') {
			parenDepth = incrementDepth(parenDepth);
		}
		if (ch === ')') {
			parenDepth = decrementDepth(parenDepth);
		}
		if (ch === '{') {
			braceDepth = incrementDepth(braceDepth);
		}
		if (ch === '}') {
			braceDepth = decrementDepth(braceDepth);
		}
		if (ch === '[') {
			bracketDepth = incrementDepth(bracketDepth);
		}
		if (ch === ']') {
			bracketDepth = decrementDepth(bracketDepth);
		}

		if (ch === ';' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
			return i;
		}

		i += 1;
	}

	return code.length;
}

function skipReturnType(code: string, idx: number): number {
	let i = idx;
	if (i >= code.length || code[i] !== ':') {
		return i;
	}

	i += 1;
	while (i < code.length) {
		if (code[i] === '=' && code[i + 1] === '>') {
			return i;
		}
		i += 1;
	}
	return i;
}

function parseFunctionHeader(code: string, idx: number): ParsedFunctionHeader | undefined {
	let i = idx + 2;
	i = skipWhitespaceInCode(code, i);
	if (i >= code.length) {
		return undefined;
	}

	const name = parseIdentifier(code, i);
	if (name.length === 0) {
		return undefined;
	}
	i += name.length;
	i = skipWhitespaceInCode(code, i);
	if (i >= code.length || code[i] !== '(') {
		return undefined;
	}

	const closeParen = findMatchingParen(code, i);
	if (closeParen < 0) {
		return undefined;
	}
	const params = code.substring(i + 1, closeParen);
	const paramsJs = compileParamsToJs(params);

	i = closeParen + 1;
	i = skipWhitespaceInCode(code, i);
	i = skipReturnType(code, i);
	i = skipWhitespaceInCode(code, i);
	if (i + 1 >= code.length || code[i] !== '=' || code[i + 1] !== '>') {
		return undefined;
	}

	i += 2;
	while (i < code.length && isWhitespace(code[i])) {
		i += 1;
	}

	return { name, paramsJs, bodyStart: i };
}

function tryReplaceFunctionAt(code: string, idx: number): FunctionReplacement | undefined {
	const header = parseFunctionHeader(code, idx);
	if (header === undefined) {
		return undefined;
	}

	const bodyEnd = findFunctionBodyEnd(code, header.bodyStart);
	const bodyExpr = code.substring(header.bodyStart, bodyEnd).trim();

	let nextIdx = bodyEnd;
	let trailing = '';
	if (nextIdx < code.length && code[nextIdx] === ';') {
		trailing = ';';
		nextIdx += 1;
	}

	const replacement = `function ${header.name}(${header.paramsJs}){return (${bodyExpr});}${trailing}`;
	return { text: replacement, nextIdx };
}

export function replaceFunctionDefinitions(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (!isKeywordAt(code, i, 'fn')) {
			result += code[i];
			i += 1;
			continue;
		}

		const replacement = tryReplaceFunctionAt(code, i);
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
