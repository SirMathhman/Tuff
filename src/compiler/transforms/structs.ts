import {
	findMatchingBrace,
	isKeywordAt,
	parseIdentifier,
	skipWhitespaceInCode,
} from '../compiler-utils';

/**
 * Compiles struct definitions and instantiations to JavaScript objects.
 * - `struct Point { x : I32, y : I32 }` → removed (type-only)
 * - `Point { x : 10, y : 20 }` → `({ x: 10, y: 20 })`
 */

function findStructDefinitionEnd(code: string, startIdx: number): number {
	let i = startIdx;
	while (i < code.length && code[i] !== '{') {
		i += 1;
	}
	if (i >= code.length) {
		return -1;
	}

	return findMatchingBrace(code, i);
}

function removeStructDefinitions(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (!isKeywordAt(code, i, 'struct')) {
			result += code[i];
			i += 1;
			continue;
		}

		const end = findStructDefinitionEnd(code, i + 6);
		if (end < 0) {
			result += code[i];
			i += 1;
			continue;
		}

		// Replace struct definition with 0; (struct definitions evaluate to 0)
		// The semicolon ensures separation from following expressions
		result += '0;';
		i = end;
	}

	return result;
}

function isStructInstantiation(code: string, idx: number): boolean {
	const ch = code[idx];
	const isUppercase = ch >= 'A' && ch <= 'Z';
	if (!isUppercase) {
		return false;
	}

	const name = parseIdentifier(code, idx);
	if (name.length === 0) {
		return false;
	}

	let j = idx + name.length;
	j = skipWhitespaceInCode(code, j);
	return j < code.length && code[j] === '{';
}

function isPrecededByIdentifier(code: string, idx: number): boolean {
	if (idx === 0) {
		return false;
	}

	let j = idx - 1;
	while (j >= 0 && (code[j] === ' ' || code[j] === '\t' || code[j] === '\n')) {
		j -= 1;
	}

	if (j < 0) {
		return false;
	}

	const ch = code[j];
	// Check if preceded by identifier character (letter or underscore)
	// Digits can end an identifier, but we need a letter/underscore somewhere before
	const isIdentifierChar = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
	if (!isIdentifierChar && !(ch >= '0' && ch <= '9')) {
		return false;
	}

	// If it's a digit, check that there's an identifier character before it
	if (ch >= '0' && ch <= '9') {
		return hasIdentifierBeforeDigit(code, j);
	}

	return true;
}

function isLetterOrUnderscore(ch: string): boolean {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function hasIdentifierBeforeDigit(code: string, startIdx: number): boolean {
	let j = startIdx;
	while (j >= 0) {
		const ch = code[j];
		const isIdentChar = (ch >= '0' && ch <= '9') || isLetterOrUnderscore(ch);
		if (!isIdentChar) {
			return false;
		}
		if (isLetterOrUnderscore(ch)) {
			return true;
		}
		j -= 1;
	}
	return false;
}

function findInstantiationEnd(code: string, startIdx: number): number {
	return findMatchingBrace(code, startIdx - 1);
}

function compileStructInstantiation(code: string, startIdx: number): string {
	const name = parseIdentifier(code, startIdx);
	let j = startIdx + name.length;
	j = skipWhitespaceInCode(code, j);

	const braceStart = j;
	const braceEnd = findInstantiationEnd(code, braceStart + 1);
	const inner = code.substring(braceStart + 1, braceEnd - 1);

	return `({${inner}})`;
}

function replaceStructInstantiations(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (!isStructInstantiation(code, i) || isPrecededByIdentifier(code, i)) {
			result += code[i];
			i += 1;
			continue;
		}

		const name = parseIdentifier(code, i);
		let j = i + name.length;
		j = skipWhitespaceInCode(code, j);
		const braceEnd = findInstantiationEnd(code, j + 1);

		result += compileStructInstantiation(code, i);
		i = braceEnd;
	}

	return result;
}

export function compileStructs(code: string): string {
	let result = removeStructDefinitions(code);
	result = replaceStructInstantiations(result);
	return result;
}
