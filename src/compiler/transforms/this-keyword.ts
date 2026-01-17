import { isKeywordAt, parseIdentifier, skipWhitespaceInCode } from '../compiler-utils';

/**
 * Compiles `this.field` to regular variable access.
 * - `this.x` → `x`
 * - `this.x = 100` → `x = 100`
 * - `let temp : This = this` → removed, and `temp.x` → `x`
 */

function isThisKeyword(code: string, idx: number): boolean {
	if (idx + 4 > code.length) {
		return false;
	}
	if (code.substring(idx, idx + 4) !== 'this') {
		return false;
	}

	if (idx > 0) {
		const prev = code[idx - 1];
		const isIdChar =
			(prev >= 'a' && prev <= 'z') ||
			(prev >= 'A' && prev <= 'Z') ||
			(prev >= '0' && prev <= '9') ||
			prev === '_';
		if (isIdChar) {
			return false;
		}
	}

	if (idx + 4 < code.length) {
		const next = code[idx + 4];
		const isIdChar =
			(next >= 'a' && next <= 'z') ||
			(next >= 'A' && next <= 'Z') ||
			(next >= '0' && next <= '9') ||
			next === '_';
		if (isIdChar) {
			return false;
		}
	}

	return true;
}

interface FieldReplacement {
	text: string;
	nextIdx: number;
}

function tryParseFieldAccess(code: string, idx: number): FieldReplacement | undefined {
	let i = idx;
	i = skipWhitespaceInCode(code, i);
	if (i >= code.length || code[i] !== '.') {
		return undefined;
	}

	i += 1;
	i = skipWhitespaceInCode(code, i);

	const fieldName = parseIdentifier(code, i);
	if (fieldName.length === 0) {
		return undefined;
	}

	return { text: fieldName, nextIdx: i + fieldName.length };
}

function tryReplaceThisDotAt(code: string, idx: number): FieldReplacement | undefined {
	return tryParseFieldAccess(code, idx + 4);
}

interface ThisTypeBinding {
	text: string;
	nextIdx: number;
	varName: string;
}

/**
 * Detects `let varname : This = this` pattern and returns the variable name.
 */
function tryParseThisTypeBinding(code: string, idx: number): ThisTypeBinding | undefined {
	let i = idx + 3; // skip 'let'
	i = skipWhitespaceInCode(code, i);

	const varName = parseIdentifier(code, i);
	if (varName.length === 0) {
		return undefined;
	}
	i += varName.length;
	i = skipWhitespaceInCode(code, i);

	if (code[i] !== ':') {
		return undefined;
	}
	i += 1;
	i = skipWhitespaceInCode(code, i);

	// Check for "This"
	if (!isKeywordAt(code, i, 'This')) {
		return undefined;
	}
	i += 4;
	i = skipWhitespaceInCode(code, i);

	if (code[i] !== '=') {
		return undefined;
	}
	i += 1;
	i = skipWhitespaceInCode(code, i);

	// Check for "this"
	if (!isKeywordAt(code, i, 'this')) {
		return undefined;
	}
	i += 4;
	i = skipWhitespaceInCode(code, i);

	// Skip optional semicolon
	if (i < code.length && code[i] === ';') {
		i += 1;
	}

	// Replace entire binding with 0 (no-op statement)
	return { text: '0;', nextIdx: i, varName };
}

function isIdentifierChar(ch: string): boolean {
	return (
		(ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_'
	);
}

/**
 * Checks if identifier at idx matches varName and is followed by `.field`.
 */
function tryReplaceThisVarDotAt(
	code: string,
	idx: number,
	thisVars: Set<string>,
): FieldReplacement | undefined {
	// Check if previous char is identifier char (part of longer identifier)
	if (idx > 0 && isIdentifierChar(code[idx - 1])) {
		return undefined;
	}

	const varName = parseIdentifier(code, idx);
	if (varName.length === 0 || !thisVars.has(varName)) {
		return undefined;
	}

	// Check next char is not identifier char
	const afterVar = idx + varName.length;
	if (afterVar < code.length && isIdentifierChar(code[afterVar])) {
		return undefined;
	}

	return tryParseFieldAccess(code, afterVar);
}

function tryProcessLetBinding(
	code: string,
	i: number,
	thisVars: Set<string>,
): FieldReplacement | undefined {
	if (!isKeywordAt(code, i, 'let')) {
		return undefined;
	}
	const thisBinding = tryParseThisTypeBinding(code, i);
	if (thisBinding === undefined) {
		return undefined;
	}
	thisVars.add(thisBinding.varName);
	return { text: thisBinding.text, nextIdx: thisBinding.nextIdx };
}

function tryProcessThisVarRef(
	code: string,
	i: number,
	thisVars: Set<string>,
): FieldReplacement | undefined {
	if (thisVars.size === 0) {
		return undefined;
	}
	return tryReplaceThisVarDotAt(code, i, thisVars);
}

function tryProcessThisFieldAccess(code: string, i: number): FieldReplacement | undefined {
	if (!isThisKeyword(code, i)) {
		return undefined;
	}
	return tryReplaceThisDotAt(code, i);
}

export function compileThisKeyword(code: string): string {
	const thisVars = new Set<string>();
	let result = '';
	let i = 0;

	while (i < code.length) {
		const letBinding = tryProcessLetBinding(code, i, thisVars);
		if (letBinding !== undefined) {
			result += letBinding.text;
			i = letBinding.nextIdx;
			continue;
		}

		const varRef = tryProcessThisVarRef(code, i, thisVars);
		if (varRef !== undefined) {
			result += varRef.text;
			i = varRef.nextIdx;
			continue;
		}

		const fieldAccess = tryProcessThisFieldAccess(code, i);
		if (fieldAccess !== undefined) {
			result += fieldAccess.text;
			i = fieldAccess.nextIdx;
			continue;
		}

		result += code[i];
		i += 1;
	}

	return result;
}
