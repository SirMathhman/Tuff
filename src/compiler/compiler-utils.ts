export function isIdentifierChar(ch: string): boolean {
	const code = ch.charCodeAt(0);
	if (code >= 48 && code <= 57) {
		return true;
	}
	if (code >= 65 && code <= 90) {
		return true;
	}
	if (code >= 97 && code <= 122) {
		return true;
	}
	return ch === '_';
}

export function isIdentifierStartChar(ch: string): boolean {
	const code = ch.charCodeAt(0);
	if (code >= 65 && code <= 90) {
		return true;
	}
	if (code >= 97 && code <= 122) {
		return true;
	}
	return ch === '_';
}

function isKeywordBoundary(ch: string | undefined): boolean {
	if (ch === undefined) {
		return true;
	}
	return !isIdentifierChar(ch);
}

export function isKeywordAt(code: string, idx: number, keyword: string): boolean {
	if (idx < 0) {
		return false;
	}
	if (idx + keyword.length > code.length) {
		return false;
	}
	if (code.substring(idx, idx + keyword.length) !== keyword) {
		return false;
	}

	let before: string | undefined;
	if (idx > 0) {
		before = code[idx - 1];
	}

	let after: string | undefined;
	if (idx + keyword.length < code.length) {
		after = code[idx + keyword.length];
	}

	if (!isKeywordBoundary(before)) {
		return false;
	}
	if (!isKeywordBoundary(after)) {
		return false;
	}
	return true;
}

export function skipWhitespaceInCode(code: string, idx: number): number {
	let i = idx;
	while (i < code.length && (code[i] === ' ' || code[i] === '\t' || code[i] === '\n')) {
		i += 1;
	}
	return i;
}

export function parseIdentifier(code: string, idx: number): string {
	let i = idx;
	while (i < code.length && isIdentifierChar(code[i])) {
		i += 1;
	}
	return code.substring(idx, i);
}

export function skipToDepthZero(
	code: string,
	idx: number,
	openChar: string,
	closeChar: string,
): number {
	let i = idx + 1;
	let depth = 1;
	while (i < code.length && depth > 0) {
		if (code[i] === openChar) {
			depth += 1;
		} else if (code[i] === closeChar) {
			depth -= 1;
		}
		i += 1;
	}
	return i;
}

export function skipBraces(code: string, idx: number): number {
	if (idx >= code.length || code[idx] !== '{') {
		return idx;
	}
	return skipToDepthZero(code, idx, '{', '}');
}

export function findMatchingParen(code: string, openIdx: number): number {
	let depth = 1;
	let i = openIdx + 1;
	while (i < code.length && depth > 0) {
		if (code[i] === '(') {
			depth += 1;
		} else if (code[i] === ')') {
			depth -= 1;
		}
		if (depth === 0) {
			return i;
		}
		i += 1;
	}
	return -1;
}

export function findMatchingBrace(code: string, startIdx: number): number {
	let depth = 1;
	let i = startIdx + 1;
	while (i < code.length && depth > 0) {
		if (code[i] === '{') {
			depth += 1;
		} else if (code[i] === '}') {
			depth -= 1;
		}
		i += 1;
	}
	return i;
}

export function findElseKeyword(code: string, startIdx: number): number {
	let depth = 0;
	let ifDepth = 0;
	let i = startIdx;

	while (i < code.length) {
		if (code[i] === '(') {
			depth += 1;
		} else if (code[i] === ')') {
			depth -= 1;
		} else if (code[i] === '{') {
			depth += 1;
		} else if (code[i] === '}') {
			depth -= 1;
		}

		if (depth === 0) {
			if (isKeywordAt(code, i, 'if')) {
				ifDepth += 1;
				i += 2;
				continue;
			}
			if (isKeywordAt(code, i, 'else')) {
				if (ifDepth === 0) {
					return i;
				}
				ifDepth -= 1;
				i += 4;
				continue;
			}
		}

		i += 1;
	}

	return -1;
}
