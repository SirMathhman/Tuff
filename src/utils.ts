/**
 * Utility functions for the Tuff language interpreter and compiler.
 */

/**
 * Extract variable names from expression and replace with values.
 *
 * @param expr - expression string
 * @param bindings - variable name to value mapping
 * @returns expression with variables replaced
 */
export function replaceVariablesInExpression(expr: string, bindings: Map<string, number>): string {
	let result = expr;
	bindings.forEach((vValue: number, vName: string): void => {
		const regex = new RegExp(`\\b${vName}\\b`, 'g');
		result = result.replace(regex, String(vValue));
	});
	return result;
}

/**
 * Find the closing angle bracket for a type parameter.
 *
 * @param source - source code
 * @param openAngleIndex - position after 'read<'
 * @returns index of closing '>', or -1 if not found
 */
export function findClosingAngle(source: string, openAngleIndex: number): number {
	let angleDepth = 1;
	for (let i = openAngleIndex; i < source.length; i++) {
		const char = source[i];
		if (char === '<') {
			angleDepth++;
			continue;
		}
		if (char !== '>') {
			continue;
		}

		angleDepth--;
		if (angleDepth === 0) {
			return i;
		}
	}
	return -1;
}

/**
 * Remove all parentheses and braces from a string.
 *
 * @param str - input string
 * @returns string with all delimiters removed
 */
export function removeDelimiters(str: string): string {
	return str.split('(').join('').split(')').join('').split('{').join('').split('}').join('').trim();
}

/**
 * Extract numeric part of a token (stripping type suffixes).
 *
 * @param source - source string
 * @returns numeric part
 */
export function extractNumericPart(source: string): string {
	let endIndex = 0;
	for (let i = 0; i < source.length; i++) {
		const char = source.charCodeAt(i);
		if (!((char >= 48 && char <= 57) || char === 46 || char === 45)) {
			endIndex = i;
			break;
		}
		endIndex = i + 1;
	}
	return source.substring(0, endIndex);
}

/**
 * Perform binary operation.
 *
 * @param operator - +, -, *, /, %
 * @param left - left operand
 * @param right - right operand
 * @returns result
 */
export function performOperation(operator: string, left: number, right: number): number {
	switch (operator) {
		case '+':
			return left + right;
		case '-':
			return left - right;
		case '*':
			return left * right;
		case '/':
			return Math.floor(left / right);
		case '%':
			return left % right;
		default:
			return left;
	}
}

/**
 * Clean up an integer string (strip delimiters and handle booleans).
 *
 * @param s - string to clean
 * @returns integer value
 */
export function cleanInt(s: string): number {
	const cleaned = s.replace(new RegExp('[(){};]', 'g'), '');
	if (cleaned === 'true') {
		return 1;
	}
	if (cleaned === 'false') {
		return 0;
	}
	return parseInt(cleaned, 10);
}

/**
 * Find matching closing parenthesis or brace in parts array.
 *
 * @param parts - array of string parts
 * @param startIdx - index where opening parenthesis/brace is found
 * @returns index of matching closing parenthesis/brace
 */
export function findMatchingParen(parts: string[], startIdx: number): number {
	let char = '(';
	let closeChar = ')';
	if (parts[startIdx].includes('{')) {
		char = '{';
		closeChar = '}';
	}
	let count = 0;
	for (let j = startIdx; j < parts.length; j++) {
		const part = parts[j];
		count += part.split(char).length - 1;
		count -= part.split(closeChar).length - 1;
		if (count === 0) {
			return j;
		}
	}
	return startIdx;
}
