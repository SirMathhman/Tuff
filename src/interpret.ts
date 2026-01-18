// Implementation dependencies
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import { generateSingleReadCode, generateSingleReadWithOp, generateMultiReadCode } from './codeGen';
import { validateTopLevelLetBinding, splitStatements } from './typeValidation';
import {
	extractNumericPart,
	findClosingAngle,
	replaceVariablesInExpression,
	removeDelimiters,
	performOperation,
	performUnaryOperation,
	cleanInt,
	findMatchingParen,
} from './utils';

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

interface ReadExpression {
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
 * Parse and evaluate a block with let-bindings.
 * Format: let varName : Type = expr; ... lastExpr
 *
 * @param blockContent - content between braces (without the braces)
 * @param readExprs - read expressions found in the original source
 * @param readIndex - current index into read expressions
 * @returns object with result and updated readIndex
 */
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

/**
 * Process a let-binding or reassignment statement and store the binding.
 *
 * @param stmt - the statement
 * @param stdinValues - stdin values array
 * @param readIndex - current position in stdin values
 * @param bindings - variable bindings map to update
 * @returns updated readIndex after processing
 */
function processStatement(
	stmt: string,
	stdinValues: number[],
	readIndex: number,
	bindings: Map<string, number>,
): number {
	let varName: string;
	let expr: string;
	let currentReadIdx = readIndex;

	const trimmed = stmt.trim();
	if (trimmed.startsWith('let ')) {
		let afterLet = trimmed.substring(4).trim();
		if (afterLet.startsWith('mut ')) {
			afterLet = afterLet.substring(4).trim();
		}

		const equalsIdx = afterLet.indexOf('=');
		if (equalsIdx === -1) {
			return currentReadIdx;
		}

		const colonIdx = afterLet.indexOf(':');
		if (colonIdx !== -1 && colonIdx < equalsIdx) {
			varName = afterLet.substring(0, colonIdx).trim();
		} else {
			varName = afterLet.substring(0, equalsIdx).trim();
		}
		expr = afterLet.substring(equalsIdx + 1).trim();
	} else {
		// Smartly check for reassignment: must start with identifier followed by =
		const reassignmentMatch = trimmed.match(new RegExp('^([a-zA-Z_][a-zA-Z0-9_]*)\\s*=(.*)$', 's'));
		if (reassignmentMatch) {
			varName = reassignmentMatch[1].trim();
			expr = reassignmentMatch[2].trim();
		} else {
			return currentReadIdx;
		}
	}

	const readResult = replaceReadsInExpression(expr, stdinValues, currentReadIdx);
	expr = readResult.expr;
	currentReadIdx = readResult.readIndex;

	expr = replaceVariablesInExpression(expr, bindings);
	bindings.set(varName, evaluateExpression(expr));
	return currentReadIdx;
}

/**
 * Evaluate a block with let-bindings, handling sequential read<>() calls.
 *
 * @param blockContent - block content to evaluate
 * @param stdinValues - stdin values array
 * @param readIndex - current position in stdin values
 * @returns object with result and updated readIndex
 */
function evaluateBlockWithReads(
	blockContent: string,
	stdinValues: number[],
	readIndex: number,
): EvalResult {
	const bindings = new Map<string, number>();
	const statements = splitStatements(blockContent);

	let currentReadIdx = readIndex;

	// Process all but the last statement as statements (lets or reassignments)
	for (let i = 0; i < statements.length - 1; i++) {
		currentReadIdx = processStatement(statements[i], stdinValues, currentReadIdx, bindings);
	}

	// Evaluate the last statement
	let lastStmt = statements[statements.length - 1];

	// Check if the last statement is also a let-binding or reassignment (no final expression)
	const trimmedLast = lastStmt.trim();
	if (
		trimmedLast.startsWith('let ') ||
		new RegExp('^([a-zA-Z_][a-zA-Z0-9_]*)\\s*=').test(trimmedLast)
	) {
		currentReadIdx = processStatement(lastStmt, stdinValues, currentReadIdx, bindings);
		// No final expression, return 0 (default exit code)
		return { result: 0, readIndex: currentReadIdx };
	}

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

	// Check if result contains top-level statements (let ... = ...; expr or x = ...; expr)
	const trimmedResult = result.trim();
	if (trimmedResult.includes(';') && !trimmedResult.startsWith('{')) {
		// Use evaluateBlockWithReads to handle the statements properly
		return evaluateBlockWithReads(result, [], 0).result;
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
		return { result: cleanInt(parts[0]), readIndex };
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
	handleAdditionSubtraction(cleanParts);
	handleLogicalOperations(cleanParts);
	let resultValue = 0;
	if (cleanParts.length > 0) {
		resultValue = cleanInt(cleanParts[0]);
	}
	return { result: resultValue, readIndex };
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
 * Handle attached unary operator ! (e.g., !1 or !!1).
 *
 * @param parts - expression parts
 * @param i - index of the part
 */
function handleAttachedUnary(parts: string[], i: number): void {
	const part = parts[i];
	let opCount = 0;
	while (opCount < part.length && part[opCount] === '!') {
		opCount++;
	}
	let val = cleanInt(part.substring(opCount));
	for (let j = 0; j < opCount; j++) {
		val = performUnaryOperation('!', val);
	}
	parts[i] = String(val);
}

/**
 * Handle unary operations (!) in parts array.
 *
 * @param parts - array of expression parts
 */
function handleUnaryOperators(parts: string[]): void {
	// Process from right to left to handle multiple unary operators naturally
	for (let i = parts.length - 1; i >= 0; i--) {
		const part = parts[i];
		if (part.startsWith('!') && part.length > 1) {
			handleAttachedUnary(parts, i);
		} else if (part === '!' && i < parts.length - 1) {
			const operand = cleanInt(parts[i + 1]);
			applySeparateUnary(parts, i, operand);
		}
	}
}

/**
 * Apply separate unary operator ! results.
 *
 * @param parts - parts
 * @param i - index
 * @param operand - value
 */
function applySeparateUnary(parts: string[], i: number, operand: number): void {
	if (!isNaN(operand)) {
		const res = performUnaryOperation('!', operand);
		parts.splice(i, 2, String(res));
	}
}

/**
 * Handle specific binary operations in parts array in-place.
 *
 * @param parts - array of expression parts
 * @param operators - array of operators to handle (e.g., ['*', '/'])
 */
function handleOperatorsInPlace(parts: string[], operators: string[]): void {
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
function handleMultiplicationDivision(parts: string[]): void {
	handleOperatorsInPlace(parts, ['*', '/']);
}

/**
 * Handle addition and subtraction operations in parts array.
 *
 * @param parts - array of expression parts
 */
function handleAdditionSubtraction(parts: string[]): void {
	handleOperatorsInPlace(parts, ['+', '-', '%']);
}

/**
 * Handle logical operations (&&, ||) in parts array.
 *
 * @param parts - array of expression parts
 */
function handleLogicalOperations(parts: string[]): void {
	handleOperatorsInPlace(parts, ['&&']);
	handleOperatorsInPlace(parts, ['||']);
}

/**
 * Evaluate arithmetic expression from parts with proper precedence.
 *
 * @param parts - array of expression parts (tokens)
 * @returns result of the expression
 */
function evaluateArithmeticParts(parts: string[]): number {
	handleUnaryOperators(parts);
	handleMultiplicationDivision(parts);
	handleAdditionSubtraction(parts);
	handleLogicalOperations(parts);
	if (parts.length === 0) {
		return 0;
	}
	return cleanInt(parts[0]);
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

	if (
		parts.length === 1 &&
		!parts[0].startsWith('!') &&
		!parts[0].includes('(') &&
		!parts[0].includes('{')
	) {
		return cleanInt(parts[0]);
	}

	// First pass: handle parentheses and braces
	processParenthesesAndBraces(parts, evaluateParentheses);

	// Second pass: handle unary operators
	handleUnaryOperators(parts);

	if (parts.length === 1) {
		return cleanInt(parts[0]);
	}

	// Third pass: handle * and / (higher precedence)
	handleMultiplicationDivision(parts);

	// Third pass: handle + and - (lower precedence)
	handleAdditionSubtraction(parts);

	// Fourth pass: handle logical operators
	handleLogicalOperations(parts);

	if (parts.length > 0) {
		return cleanInt(parts[0]);
	}
	return 0;
}

function parseStdIn(stdIn: string): number[] {
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
 * Interpret the given source code with provided stdin.
 * This is a stub implementation that should return an exit code.
 *
 * @param source - source code to interpret
 * @param stdIn - input provided to the program
 * @returns exit code (number)
 */
export function interpret(source: string, stdIn: string): Result<number, string> {
	// DO NOT CALL COMPILE
	const typeError = validateTopLevelLetBinding(source);
	if (typeError) {
		return { ok: false, error: typeError };
	}

	const readExprs = findAllReadExpressions(source);
	const stdinValues = parseStdIn(stdIn);

	if (source.includes('let ') || source.includes('=')) {
		const result = interpretWithLetBindings(source, stdinValues);
		return { ok: true, value: result };
	}

	if (readExprs.length === 0) {
		const trimmed = source.trim();
		const numericPart = extractNumericPart(trimmed);
		if (numericPart === trimmed) {
			return { ok: true, value: cleanInt(numericPart) };
		}
	}

	let evaluatedSource = source;
	for (let i = 0; i < readExprs.length; i++) {
		evaluatedSource = evaluatedSource.replace(readExprs[i].expression, String(stdinValues[i]));
	}

	const numericPart = extractNumericPart(evaluatedSource);
	if (numericPart === evaluatedSource.trim()) {
		return { ok: true, value: parseInt(numericPart, 10) };
	}

	const seqResult = evaluateExpressionSequential(evaluatedSource, stdinValues, 0);
	return { ok: true, value: seqResult.result };
}

function generateLetBindingCompileCode(source: string): string {
	const readExprs = findAllReadExpressions(source);
	let replacedSource = source;
	for (let i = 0; i < readExprs.length; i++) {
		replacedSource = replacedSource.replace(readExprs[i].expression, `values[${i}]`);
	}
	return generateMultiReadCode(replacedSource);
}

function generateNumericCompileCode(source: string): string {
	const numericPart = extractNumericPart(source);
	return `process.exit(${parseInt(numericPart, 10)});`;
}

interface ReadExpressionRange {
	endIndex: number;
}

function generateSingleReadWithOpCode(source: string, readExpr: ReadExpressionRange): string {
	const afterRead = source.substring(readExpr.endIndex).trim();

	if (!afterRead || afterRead === ';') {
		return generateSingleReadCode();
	}

	// read<>() with single operation
	const operatorMatch = afterRead.split(' ');
	const operator = operatorMatch[0];
	const operand = operatorMatch[1] || '0';
	return generateSingleReadWithOp(operator, operand);
}

/**
 * Compile the given source to a target string.
 *
 * @param source - source code to compile
 * @returns compiled target as a string
 */
export const compile = (source: string): Result<string, string> => {
	// DO NOT CALL INTERPRET

	// Validate top-level let-bindings for type compatibility
	const typeError = validateTopLevelLetBinding(source);
	if (typeError) {
		return { ok: false, error: typeError };
	}

	const trimmedSource = source.trim();

	// Check if this is a top-level let-binding
	if (
		trimmedSource.startsWith('let ') &&
		trimmedSource.includes(';') &&
		!trimmedSource.startsWith('{')
	) {
		return { ok: true, value: generateLetBindingCompileCode(source) };
	}

	// Check if this is a top-level let-binding with no final expression
	if (trimmedSource.startsWith('let ') && trimmedSource.endsWith(';')) {
		return { ok: true, value: 'process.exit(0);' };
	}

	const readExprs = findAllReadExpressions(source);
	if (readExprs.length === 0) {
		return { ok: true, value: generateNumericCompileCode(source) };
	}

	if (readExprs.length === 1) {
		const readExpr = readExprs[0];
		const beforeRead = source.substring(0, readExpr.startIndex).trim();
		if (!beforeRead) {
			return { ok: true, value: generateSingleReadWithOpCode(source, readExpr) };
		}
	}

	// Multiple read<>() calls or complex single call - replace them with array indices and evaluate
	return { ok: true, value: generateLetBindingCompileCode(source) };
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
