// Implementation dependencies
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import { generateSingleReadCode, generateSingleReadWithOp, generateMultiReadCode } from './codeGen';

// Type definitions
export interface ResultOk<T> {
	ok: true;
	value: T;
}

export interface ResultError<E> {
	ok: false;
	error: E;
}

export type Result<T, E> = ResultOk<T> | ResultError<E>;

interface EvalResult {
	result: number;
	readIndex: number;
}

interface ReplaceReadResult {
	expr: string;
	readIndex: number;
}

interface VariableBindings {
	readonly [key: string]: number;
}

interface MutableVariableBindings {
	[key: string]: number;
}

interface ReadExpression {
	startIndex: number;
	endIndex: number;
	expression: string;
}

function extractNumericPart(source: string): string {
	// Strip type suffix (e.g., 'U8', 'I32', etc.)
	let endIndex = 0;
	for (let i = 0; i < source.length; i++) {
		const char = source.charCodeAt(i);
		// Check if character is a digit or decimal point
		if (!((char >= 48 && char <= 57) || char === 46)) {
			// Found first non-digit, non-dot character
			endIndex = i;
			break;
		}
		endIndex = i + 1;
	}
	return source.substring(0, endIndex);
}

/**
 * Find all read<TYPE>() expressions in source and return them.
 *
 * @param source - source code
 * @returns array of ReadExpression objects
 */
function findAllReadExpressions(source: string): ReadExpression[] {
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
 * Find the closing angle bracket for a type parameter.
 *
 * @param source - source code
 * @param openAngleIndex - position after 'read<'
 * @returns index of closing '>', or -1 if not found
 */
function findClosingAngle(source: string, openAngleIndex: number): number {
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
 * Parse and evaluate a block with let-bindings.
 * Format: let varName : Type = expr; ... lastExpr
 *
 * @param blockContent - content between braces (without the braces)
 * @param readExprs - read expressions found in the original source
 * @param readIndex - current index into read expressions
 * @returns object with result and updated readIndex
 */
/**
 * Replace variable names in expression with their values.
 *
 * @param expr - expression string
 * @param bindings - variable name to value mapping
 * @returns expression with variables replaced
 */
function replaceVariablesInExpression(expr: string, bindings: VariableBindings): string {
	let result = expr;
	for (const [vName, vValue] of Object.entries(bindings)) {
		const regex = new RegExp(`\\b${vName}\\b`, 'g');
		result = result.replace(regex, String(vValue));
	}
	return result;
}

/**
 * Replace read<>() calls in expression with values from stdin.
 *
 * @param expr - expression with read<>() calls
 * @param stdinValues - array of stdin values
 * @param startIndex - starting index in stdinValues
 * @returns object with modified expression and new read index
 */
function replaceReadsInExpression(
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
 * Evaluate block with let-bindings.
 *
 * @param blockContent - content of the block (let bindings and final expression)
 * @param stdinValues - array of stdin values
 * @param readIndex - current position in stdin values
 * @returns object with result and updated read index
 */
function evaluateBlockWithReads(
	blockContent: string,
	stdinValues: number[],
	readIndex: number,
): EvalResult {
	const bindings: MutableVariableBindings = {};
	const statements = blockContent
		.split(';')
		.map((s: string): string => s.trim())
		.filter((s: string): boolean => Boolean(s));

	let currentReadIdx = readIndex;

	// Process all but the last statement as let-bindings
	for (let i = 0; i < statements.length - 1; i++) {
		const stmt = statements[i];
		if (!stmt.startsWith('let ')) {
			continue;
		}
		// eslint-disable-next-line no-restricted-syntax
		const match = stmt.match(/let\s+(\w+)\s*:\s*\w+\s*=\s*(.+)/);
		if (!match) {
			continue;
		}

		const varName = match[1];
		let expr = match[2];
		const readResult = replaceReadsInExpression(expr, stdinValues, currentReadIdx);
		expr = readResult.expr;
		currentReadIdx = readResult.readIndex;

		expr = replaceVariablesInExpression(expr, bindings);
		bindings[varName] = evaluateExpression(expr);
	}

	// Evaluate the last statement
	let lastStmt = statements[statements.length - 1];
	const lastReadResult = replaceReadsInExpression(lastStmt, stdinValues, currentReadIdx);
	lastStmt = lastReadResult.expr;
	currentReadIdx = lastReadResult.readIndex;

	lastStmt = replaceVariablesInExpression(lastStmt, bindings);
	return { result: evaluateExpression(lastStmt), readIndex: currentReadIdx };
}

/**
 * Interpret source with let-bindings, handling sequential read<>() calls.
 *
 * @param source - source code with let-bindings
 * @param stdinValues - parsed stdin values
 * @returns exit code
 */
function interpretWithLetBindings(source: string, stdinValues: number[]): number {
	// Replace all read<>() calls sequentially from left to right
	let result = source;
	let stdinIdx = 0;

	while (result.includes('read<') && stdinIdx < stdinValues.length) {
		const readStart = result.indexOf('read<');
		const readEnd = result.indexOf('()', readStart) + 2;
		result =
			result.substring(0, readStart) + String(stdinValues[stdinIdx]) + result.substring(readEnd);
		stdinIdx++;
	}

	// Now evaluate the expression normally
	const numericPart = extractNumericPart(result);
	if (numericPart === result.trim()) {
		// It's just a number
		return parseInt(numericPart, 10);
	}

	// It has operations - parse and evaluate
	return evaluateExpression(result);
}

/**
 * Evaluate expression sequentially, handling read<>() calls in order.
 *
 * @param expr - expression to evaluate
 * @param stdinValues - stdin values array
 * @param readIndex - current position in stdin values
 * @returns object with result and updated readIndex
 */
function evaluateExpressionSequential(
	expr: string,
	stdinValues: number[],
	readIndex: number,
): EvalResult {
	const trimmed = expr.trim();
	const parts = trimmed.split(' ').filter((p: string): boolean => Boolean(p));

	if (parts.length === 1) {
		return { result: parseInt(parts[0], 10), readIndex };
	}

	// First pass: handle parentheses and braces
	const currentReadIdx = processParenthesesAndBraces(
		parts,
		(innerParts): EvalResult => evaluateParenthesesSequential(innerParts, stdinValues, 0),
	);

	// Evaluate resulting expression with arithmetic precedence
	return {
		result: evaluateArithmeticParts(parts),
		readIndex: currentReadIdx || readIndex,
	};
}

/**
 * Evaluate parentheses/braces sequentially with read<>() calls.
 *
 * @param innerParts - parts inside parentheses/braces
 * @param stdinValues - stdin values
 * @param readIndex - current read index
 * @returns result and updated readIndex
 */
function evaluateParenthesesSequential(
	innerParts: string[],
	stdinValues: number[],
	readIndex: number,
): EvalResult {
	const content = innerParts.join(' ').trim();

	// Check if this is a let-binding block
	if (content.includes('let ')) {
		const cleanContent = content.split('{').join('').split('}').join('').trim();
		return evaluateBlockWithReads(cleanContent, stdinValues, readIndex);
	}

	// Remove delimiters
	const cleanParts = innerParts
		.map((p: string): string => removeDelimiters(p))
		.filter((p: string): boolean => Boolean(p));

	handleMultiplicationDivision(cleanParts);
	return { result: handleAdditionSubtraction(cleanParts), readIndex };
}

/**
 * Perform a binary operation.
 *
 * @param operator - the operator (+, -, *, /, %)
 * @param left - left operand
 * @param right - right operand
 * @returns result of the operation
 */
function performOperation(operator: string, left: number, right: number): number {
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
 * Find matching closing parenthesis or brace in parts array.
 *
 * @param parts - array of string parts
 * @param startIdx - index where opening parenthesis/brace is found
 * @returns index of matching closing parenthesis/brace
 */
function findMatchingParen(parts: string[], startIdx: number): number {
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

/**
 * Remove all parentheses and braces from a string.
 *
 * @param str - input string
 * @returns string with all delimiters removed
 */
function removeDelimiters(str: string): string {
	return str.split('(').join('').split(')').join('').split('{').join('').split('}').join('').trim();
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
 * Process parentheses and braces in expression parts with optional stdin tracking.
 *
 * @param parts - array of expression parts
 * @param evaluator - callback to evaluate inner parts, returns either number or EvalResult
 * @returns updated read index if evaluator returns EvalResult, otherwise 0
 */
function processParenthesesAndBraces(
	parts: string[],
	evaluator: (innerParts: string[]) => number | EvalResult,
): number {
	let readIdx = 0;
	let i = 0;
	while (i < parts.length) {
		if (!parts[i].includes('(') && !parts[i].includes('{')) {
			i++;
			continue;
		}
		const endIdx = findMatchingParen(parts, i);
		const innerParts = parts.slice(i, endIdx + 1);
		const result = evaluator(innerParts);
		parts.splice(i, endIdx - i + 1, String(extractEvalResultValue(result)));
		readIdx = extractReadIndex(result);
	}
	return readIdx;
}

/**
 * Handle multiplication and division operations in parts array.
 *
 * @param parts - array of expression parts
 */
function handleMultiplicationDivision(parts: string[]): void {
	let i = 0;
	while (i < parts.length) {
		if (i > 0 && i < parts.length - 1 && (parts[i] === '*' || parts[i] === '/')) {
			const left = parseInt(parts[i - 1], 10);
			const operator = parts[i];
			const right = parseInt(parts[i + 1], 10);
			const result = performOperation(operator, left, right);
			parts.splice(i - 1, 3, String(result));
		} else {
			i++;
		}
	}
}

/**
 * Handle addition and subtraction operations in parts array.
 *
 * @param parts - array of expression parts
 * @returns result after all additions and subtractions
 */
function handleAdditionSubtraction(parts: string[]): number {
	let result = parseInt(parts[0], 10);
	for (let j = 1; j < parts.length; j += 2) {
		const operator = parts[j];
		const operand = parseInt(parts[j + 1], 10);
		result = performOperation(operator, result, operand);
	}
	return result;
}

/**
 * Evaluate arithmetic expression from parts with proper precedence.
 *
 * @param parts - array of expression parts (tokens)
 * @returns result of the expression
 */
function evaluateArithmeticParts(parts: string[]): number {
	handleMultiplicationDivision(parts);
	return handleAdditionSubtraction(parts);
}

/**
 * Evaluate let-binding block within parenthesized expression.
 *
 * @param content - parenthesized expression content
 * @returns evaluated result
 */
function evaluateParenthesesWithLetBinding(content: string): number {
	const braceStart = content.indexOf('{');
	const braceEnd = content.lastIndexOf('}');
	let beforeBrace = content.substring(0, braceStart).trim();
	const blockContent = content.substring(braceStart + 1, braceEnd).trim();
	let afterBrace = content.substring(braceEnd + 1).trim();

	beforeBrace = removeDelimiters(beforeBrace);
	afterBrace = removeDelimiters(afterBrace);

	const blockResult = evaluateBlockWithReads(blockContent, [], 0).result;

	let finalExpr = '';
	if (beforeBrace) {
		finalExpr = `${beforeBrace} ${blockResult}`;
	} else {
		finalExpr = String(blockResult);
	}
	if (afterBrace) {
		finalExpr = `${finalExpr} ${afterBrace}`;
	}

	const cleanParts = finalExpr.split(' ').filter((p: string): boolean => Boolean(p));
	return evaluateArithmeticParts(cleanParts);
}

/**
 * Evaluate expression inside parentheses or braces (without outer delimiters).
 *
 * @param innerParts - parts inside parentheses/braces
 * @returns evaluated result
 */
function evaluateParentheses(innerParts: string[]): number {
	const content = innerParts.join(' ').trim();

	// Check if this contains a let-binding block (in braces)
	if (content.includes('{') && content.includes('let ')) {
		return evaluateParenthesesWithLetBinding(content);
	}

	const cleanParts = innerParts
		.map((p: string): string => removeDelimiters(p))
		.filter((p: string): boolean => Boolean(p));

	return evaluateArithmeticParts(cleanParts);
}

/**
 * Evaluate a full arithmetic expression with proper order of operations.
 * Supports parentheses, multiplication/division (higher precedence), and addition/subtraction (lower precedence).
 *
 * @param expr - arithmetic expression string (e.g., '1 + 2', '5 * 3 - 1', '(1 + 2) * 3')
 * @returns result of the expression
 */
function evaluateExpression(expr: string): number {
	// Parse expression with operator precedence and parentheses
	const trimmed = expr.trim();
	const parts = trimmed.split(' ').filter((p: string): boolean => Boolean(p));

	if (parts.length === 1) {
		return parseInt(parts[0], 10);
	}

	// First pass: handle parentheses and braces
	processParenthesesAndBraces(parts, evaluateParentheses);

	// Second pass: handle * and / (higher precedence)
	handleMultiplicationDivision(parts);

	// Third pass: handle + and - (lower precedence)
	return handleAdditionSubtraction(parts);
}

/**
 * Interpret the given source code with provided stdin.
 * This is a stub implementation that should return an exit code.
 *
 * @param source - source code to interpret
 * @param stdIn - input provided to the program
 * @returns exit code (number)
 */
export function interpret(source: string, stdIn: string): Result<number, string> {
	// DO NOT CALL COMPILE

	const readExprs = findAllReadExpressions(source);
	if (readExprs.length === 0) {
		// No read expression, parse as a numeric literal
		const numericPart = extractNumericPart(source);
		return { ok: true, value: parseInt(numericPart, 10) };
	}

	// Parse all values from stdIn (space-separated)
	const stdinValues = stdIn
		.trim()
		.split(' ')
		.map((v: string): number => parseInt(v, 10));

	// Check if source contains let-bindings
	if (source.includes('let ')) {
		const result = interpretWithLetBindings(source, stdinValues);
		return { ok: true, value: result };
	}

	// Replace each read<>() with its corresponding value
	let evaluatedSource = source;
	for (let i = 0; i < readExprs.length; i++) {
		evaluatedSource = evaluatedSource.replace(readExprs[i].expression, String(stdinValues[i]));
	}

	// Now evaluate the expression with numeric values
	const numericPart = extractNumericPart(evaluatedSource);
	if (numericPart === evaluatedSource.trim()) {
		// It's just a number
		return { ok: true, value: parseInt(numericPart, 10) };
	}

	// It has operations - parse and evaluate
	return { ok: true, value: evaluateExpressionSequential(evaluatedSource, stdinValues, 0).result };
}

/**
 * Compile the given source to a target string.
 *
 * @param source - source code to compile
 * @returns compiled target as a string
 */
export const compile = (source: string): Result<string, string> => {
	// DO NOT CALL INTERPRET

	const readExprs = findAllReadExpressions(source);
	if (readExprs.length === 0) {
		// No read expression, compile as a numeric literal
		const numericPart = extractNumericPart(source);
		return { ok: true, value: `process.exit(${parseInt(numericPart, 10)});` };
	}

	if (readExprs.length === 1) {
		// Single read<>() call - use optimized path
		const readExpr = readExprs[0];
		const afterRead = source.substring(readExpr.endIndex).trim();

		if (!afterRead) {
			return { ok: true, value: generateSingleReadCode() };
		}

		// read<>() with single operation
		const operatorMatch = afterRead.split(' ');
		const operator = operatorMatch[0];
		const operand = operatorMatch[1] || '0';
		return { ok: true, value: generateSingleReadWithOp(operator, operand) };
	}

	// Multiple read<>() calls - replace them with array indices and evaluate
	let replacedSource = source;
	for (let i = 0; i < readExprs.length; i++) {
		replacedSource = replacedSource.replace(readExprs[i].expression, `values[${i}]`);
	}

	return { ok: true, value: generateMultiReadCode(replacedSource) };
};

/**
 * Execute the given target string and return an exit code.
 *
 * @param target - compiled target to execute
 * @param stdIn - stdin to pass to the program
 * @returns exit code (number)
 */
export const execute = (target: string, stdIn: string): number => {
	// Write the target to a temporary file and run it with Node.js, passing stdIn
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-'));
	const id = Math.floor(Math.random() * 1_000_000);
	const filePath = path.join(tmpDir, `program-${id}.js`);

	fs.writeFileSync(filePath, target, 'utf8');

	let result: SpawnSyncReturns<Buffer | string>;
	try {
		result = spawnSync(process.execPath, [filePath], {
			input: stdIn,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});
	} finally {
		try {
			fs.unlinkSync(filePath);
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch (e) {
			// ignore cleanup errors
		}
	}

	if (typeof result.status === 'number') {
		return result.status;
	}
	if (typeof result.signal === 'string') {
		return 128;
	}

	// fallback error
	return 1;
};

/**
 * Compile source code and execute with provided stdin.
 * This uses `compile` and `execute` helpers so tests can
 * override/mock them.
 *
 * @param source - source code to compile and run
 * @param stdIn - input provided to the program
 * @returns exit code (number)
 */
export function compileAndExecute(source: string, stdIn: string): Result<number, string> {
	const compileResult = compile(source);
	if (!compileResult.ok) {
		return { ok: false, error: compileResult.error };
	}
	const target = compileResult.value;
	const exitCode = execute(target, stdIn);
	return { ok: true, value: exitCode };
}
