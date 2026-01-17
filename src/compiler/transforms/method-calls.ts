import { findMatchingParen, isIdentifierChar, parseIdentifier } from '../compiler-utils';

interface MethodCallMatch {
	methodName: string;
	parenStart: number;
}

function findMethodCallAt(
	code: string,
	dotIdx: number,
	methodNames: Set<string>,
): MethodCallMatch | undefined {
	// Find the identifier after the dot
	let j = dotIdx + 1;
	while (j < code.length && (code[j] === ' ' || code[j] === '\t')) {
		j += 1;
	}
	const methodName = parseIdentifier(code, j);
	if (methodName.length === 0 || !methodNames.has(methodName)) {
		return undefined;
	}
	j += methodName.length;
	while (j < code.length && (code[j] === ' ' || code[j] === '\t')) {
		j += 1;
	}
	if (j >= code.length || code[j] !== '(') {
		return undefined;
	}
	return { methodName, parenStart: j };
}

function buildMethodCall(methodName: string, expr: string, args: string): string {
	if (args.length > 0) {
		return `${methodName}(${expr}, ${args})`;
	}
	return `${methodName}(${expr})`;
}

function isExpressionTerminator(ch: string): boolean {
	return ch === ';' || ch === ',' || ch === '=' || ch === '{' || ch === '}';
}

function checkKeywordBoundary(code: string, idx: number): number {
	// Check if this is after a keyword like 'return' or 'let'
	let j = idx - 1;
	while (j >= 0 && isIdentifierChar(code[j])) {
		j -= 1;
	}
	const word = code.substring(j + 1, idx);
	if (word === 'return' || word === 'let' || word === 'const') {
		return idx + 1;
	}
	return -1;
}

interface ExprBoundaryResult {
	result: number;
	depth: number;
}

function processExprBoundaryChar(
	code: string,
	ch: string,
	idx: number,
	depth: number,
): ExprBoundaryResult {
	if (ch === ')' || ch === ']') {
		return { result: -1, depth: depth + 1 };
	}
	if (ch === '(' || ch === '[') {
		const newDepth = depth - 1;
		if (newDepth < 0) {
			return { result: idx + 1, depth: newDepth };
		}
		return { result: -1, depth: newDepth };
	}
	if (depth === 0 && isExpressionTerminator(ch)) {
		return { result: idx + 1, depth };
	}
	if (depth === 0 && (ch === ' ' || ch === '\t' || ch === '\n')) {
		const keywordEnd = checkKeywordBoundary(code, idx);
		if (keywordEnd >= 0) {
			return { result: keywordEnd, depth };
		}
	}
	return { result: -1, depth };
}

function findExpressionStart(code: string): number {
	// Work backwards to find where the expression starts
	let i = code.length - 1;
	let depth = 0;

	// Handle trailing whitespace
	while (i >= 0 && (code[i] === ' ' || code[i] === '\t' || code[i] === '\n')) {
		i -= 1;
	}

	while (i >= 0) {
		const ch = code[i];
		const boundaryResult = processExprBoundaryChar(code, ch, i, depth);
		if (boundaryResult.result >= 0) {
			return boundaryResult.result;
		}
		depth = boundaryResult.depth;
		i -= 1;
	}

	return 0;
}

export function transformMethodCalls(code: string, methodNames: Set<string>): string {
	if (methodNames.size === 0) {
		return code;
	}

	let result = '';
	let i = 0;

	while (i < code.length) {
		if (code[i] !== '.') {
			result += code[i];
			i += 1;
			continue;
		}

		const match = findMethodCallAt(code, i, methodNames);
		if (match === undefined) {
			result += code[i];
			i += 1;
			continue;
		}

		const closeParen = findMatchingParen(code, match.parenStart);
		if (closeParen < 0) {
			result += code[i];
			i += 1;
			continue;
		}

		const exprStart = findExpressionStart(result);
		const expr = result.substring(exprStart);
		result = result.substring(0, exprStart);
		const args = code.substring(match.parenStart + 1, closeParen).trim();
		result += buildMethodCall(match.methodName, expr, args);
		i = closeParen + 1;
	}

	return result;
}
