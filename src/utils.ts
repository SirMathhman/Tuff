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
/**
 * Perform a comparison operation.
 *
 * @param operator - comparison operator
 * @param left - left value
 * @param right - right value
 * @returns 1 if true, 0 if false
 */
function performComparison(operator: string, left: number, right: number): number {
	switch (operator) {
		case '<': {
			if (left < right) {
				return 1;
			}
			return 0;
		}
		case '>': {
			if (left > right) {
				return 1;
			}
			return 0;
		}
		case '<=': {
			if (left <= right) {
				return 1;
			}
			return 0;
		}
		case '>=': {
			if (left >= right) {
				return 1;
			}
			return 0;
		}
		case '==': {
			if (left === right) {
				return 1;
			}
			return 0;
		}
		case '!=': {
			if (left !== right) {
				return 1;
			}
			return 0;
		}
		default:
			return 0;
	}
}

/**
 * Perform an arithmetic or logical operation.
 *
 * @param operator - operation symbol
 * @param left - left operand
 * @param right - right operand
 * @returns result of the operation
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
		case '<':
		case '>':
		case '<=':
		case '>=':
		case '==':
		case '!=':
			return performComparison(operator, left, right);
		case '||': {
			if (left !== 0 || right !== 0) {
				return 1;
			}
			return 0;
		}
		case '&&': {
			if (left !== 0 && right !== 0) {
				return 1;
			}
			return 0;
		}
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
 * Handle unary operation.
 *
 * @param operator - !
 * @param operand - value
 * @returns result
 */
export function performUnaryOperation(operator: string, operand: number): number {
	switch (operator) {
		case '!': {
			if (operand === 0) {
				return 1;
			}
			return 0;
		}
		case '-': {
			return -operand;
		}
		default:
			return operand;
	}
}

export interface ReadExpression {
	startIndex: number;
	endIndex: number;
	expression: string;
}

/**
 * Find all read<TYPE>() expressions in source and return them.
 *
 * @param source - source code
 * @returns array of ReadExpression objects
 */
export function findAllReadExpressions(source: string): ReadExpression[] {
	const results: ReadExpression[] = [];
	let searchStart = 0;

	while (searchStart < source.length) {
		const readStart = source.indexOf('read<', searchStart);
		if (readStart === -1) {
			break;
		}

		const closeAngle = findClosingAngle(source, readStart + 5);
		if (closeAngle === -1) {
			searchStart = readStart + 1;
			continue;
		}

		// Find the closing parenthesis
		const parenStart = closeAngle + 1;
		if (source[parenStart] !== '(' || source[parenStart + 1] !== ')') {
			searchStart = readStart + 1;
			continue;
		}

		const endIndex = parenStart + 2;
		const expression = source.substring(readStart, endIndex);
		results.push({ startIndex: readStart, endIndex, expression });

		searchStart = endIndex;
	}

	return results;
}

/**
 * Parse stdin string into an array of values.
 *
 * @param stdIn - stdin string
 * @returns array of values (parsed as numbers/booleans where possible)
 */
export function parseStdIn(stdIn: string): number[] {
	return stdIn
		.trim()
		.split(new RegExp('\\s+'))
		.filter((v: string): boolean => Boolean(v))
		.map((v: string): number => {
			if (v === 'true') {
				return 1;
			}
			if (v === 'false') {
				return 0;
			}
			return parseInt(v, 10);
		});
}

/**
 * Handle specific binary operations in parts array in-place.
 *
 * @param parts - array of expression parts
 * @param operators - array of operators to handle (e.g., ['*', '/'])
 */
export function handleOperatorsInPlace(parts: string[], operators: string[]): void {
	let i = 0;
	while (i < parts.length) {
		if (i > 0 && i < parts.length - 1 && operators.includes(parts[i])) {
			const left = cleanInt(parts[i - 1]);
			const operator = parts[i];
			const right = cleanInt(parts[i + 1]);
			const result = performOperation(operator, left, right);
			parts.splice(i - 1, 3, String(result));
		} else {
			i++;
		}
	}
}

/**
 * Handle multiplication and division operations in parts array.
 *
 * @param parts - array of expression parts
 */
export function handleMultiplicationDivision(parts: string[]): void {
	handleOperatorsInPlace(parts, ['*', '/']);
}

/**
 * Handle addition and subtraction operations in parts array.
 *
 * @param parts - array of expression parts
 */
export function handleAdditionSubtraction(parts: string[]): void {
	handleOperatorsInPlace(parts, ['+', '-', '%']);
}

/**
 * Handle comparison operations in parts array.
 *
 * @param parts - array of expression parts
 */
export function handleComparisons(parts: string[]): void {
	handleOperatorsInPlace(parts, ['<=', '>=', '<', '>', '==', '!=']);
}

/**
 * Handle logical operations (&&, ||) in parts array.
 *
 * @param parts - array of expression parts
 */
export function handleLogicalOperations(parts: string[]): void {
	handleOperatorsInPlace(parts, ['&&']);
	handleOperatorsInPlace(parts, ['||']);
}

/**
 * Handle attached unary operator ! or - (e.g., !1, !!1, -1, --1, !-1).
 *
 * @param parts - expression parts
 * @param i - index of the part
 */
function handleAttachedUnary(parts: string[], i: number): void {
	const part = parts[i];
	const ops: string[] = [];
	let idx = 0;
	while (idx < part.length && (part[idx] === '!' || part[idx] === '-')) {
		ops.push(part[idx]);
		idx++;
	}
	let val = cleanInt(part.substring(idx));
	// Process operators from right to left
	for (let j = ops.length - 1; j >= 0; j--) {
		val = performUnaryOperation(ops[j], val);
	}
	parts[i] = String(val);
}

/**
 * Handle separate unary operator (!, -).
 *
 * @param parts - expression parts
 * @param i - index
 * @param operator - the operator
 */
function handleSeparateUnary(parts: string[], i: number, operator: string): void {
	const allOps = ['!', '-', '+', '*', '/', '%', '&&', '||'];
	// It's unary if it's at start OR preceded by another operator
	const isUnary = i === 0 || (i > 0 && allOps.includes(parts[i - 1]));
	if (isUnary && i < parts.length - 1) {
		const operand = cleanInt(parts[i + 1]);
		if (!isNaN(operand)) {
			const res = performUnaryOperation(operator, operand);
			parts.splice(i, 2, String(res));
		}
	}
}

/**
 * Handle unary operations (!, -) in parts array.
 *
 * @param parts - array of expression parts
 */
export function handleUnaryOperators(parts: string[]): void {
	const unaryOps = ['!', '-'];
	const binaryOpsStartingWithUnary = ['!=', '!==']; // Don't treat these as unary operators

	// Process from right to left to handle multiple unary operators naturally
	for (let i = parts.length - 1; i >= 0; i--) {
		const part = parts[i];

		// Skip binary operators that start with unary operator symbols
		if (binaryOpsStartingWithUnary.includes(part)) {
			continue;
		}

		const isAttached =
			(part.startsWith('!') && part.length > 1) ||
			(part.startsWith('-') && part.length > 1 && isNaN(Number(part)));

		if (isAttached) {
			handleAttachedUnary(parts, i);
		} else if (unaryOps.includes(part)) {
			handleSeparateUnary(parts, i, part);
		}
	}
}

/**
 * Evaluate arithmetic expression from parts with proper precedence.
 *
 * @param parts - array of expression parts (tokens)
 * @returns result of the expression
 */
export function evaluateArithmeticParts(parts: string[]): number {
	handleUnaryOperators(parts);
	handleMultiplicationDivision(parts);
	handleAdditionSubtraction(parts);
	handleComparisons(parts);
	handleLogicalOperations(parts);
	if (parts.length === 0) {
		return 0;
	}
	return cleanInt(parts[0]);
}

export interface EvalResult {
	result: number;
	readIndex: number;
}

/**
 * Process a single segment with parentheses/braces using the evaluator.
 *
 * @param result - result from evaluator (number or EvalResult)
 * @returns result value if number, otherwise the result field
 */
function extractEvalResultValue(result: number | EvalResult): number {
	if (typeof result === 'number') {
		return result;
	}
	return result.result;
}

/**
 * Update read index from evaluation result if applicable.
 *
 * @param result - result from evaluator
 * @returns updated read index or 0
 */
function extractReadIndex(result: number | EvalResult): number {
	if (typeof result === 'number') {
		return 0;
	}
	return result.readIndex;
}

/**
 * Handle inner segment of parentheses or braces.
 *
 * @param parts - parts array to update
 * @param i - start index
 * @param evaluator - evaluation function
 * @returns updated read index
 */
function handleInnerSegment(
	parts: string[],
	i: number,
	evaluator: (innerParts: string[]) => number | EvalResult,
): number {
	const closeIdx = findMatchingParen(parts, i);
	if (closeIdx === -1) {
		return 0;
	}

	const innerParts = parts.slice(i, closeIdx + 1);
	const res = evaluator(innerParts);
	const val = extractEvalResultValue(res);
	const idx = extractReadIndex(res);

	parts.splice(i, closeIdx - i + 1, String(val));
	return idx;
}

/**
 * Process parentheses and braces in expression parts with optional stdin tracking.
 *
 * @param parts - array of expression parts
 * @param evaluator - callback to evaluate inner parts, returns either number or EvalResult
 * @returns updated read index if evaluator returns EvalResult, otherwise 0
 */
export function processParenthesesAndBraces(
	parts: string[],
	evaluator: (innerParts: string[]) => number | EvalResult,
): number {
	let currentReadIndex = 0;
	let i = 0;
	while (i < parts.length) {
		const hasGroup = parts[i].includes('(') || parts[i].includes('{');
		if (hasGroup) {
			const idx = handleInnerSegment(parts, i, evaluator);
			currentReadIndex = Math.max(currentReadIndex, idx);
			continue;
		}
		i++;
	}
	return currentReadIndex;
}

export interface ReplaceReadResult {
	expr: string;
	readIndex: number;
}

/**
 * Replace read<>() calls in expression with values from stdin.
 *
 * @param expr - expression with read<>() calls
 * @param stdinValues - array of stdin values
 * @param startIndex - starting index in stdinValues
 * @returns object with modified expression and new read index
 */
export function replaceReadsInExpression(
	expr: string,
	stdinValues: number[],
	startIndex: number,
): ReplaceReadResult {
	let result = expr;
	let currentIdx = startIndex;
	while (result.includes('read<') && currentIdx < stdinValues.length) {
		const readStart = result.indexOf('read<');
		const readEnd = result.indexOf('()', readStart) + 2;
		result =
			result.substring(0, readStart) + String(stdinValues[currentIdx]) + result.substring(readEnd);
		currentIdx++;
	}
	return { expr: result, readIndex: currentIdx };
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
