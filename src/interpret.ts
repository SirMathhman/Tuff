// Implementation dependencies
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync, SpawnSyncReturns } from 'child_process';

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
 * Find the position and content of read<TYPE>() expression in source.
 *
 * @param source - source code
 * @returns object with startIndex, endIndex, and expression, or undefined if not found
 */
function findReadExpression(source: string): ReadExpression | undefined {
	const readStart = source.indexOf('read<');
	if (readStart === -1) {
		return undefined;
	}

	const closeAngle = findClosingAngle(source, readStart + 5);
	if (closeAngle === -1) {
		return undefined;
	}

	// Find the closing parenthesis
	const parenStart = closeAngle + 1;
	if (source[parenStart] !== '(' || source[parenStart + 1] !== ')') {
		return undefined;
	}

	const endIndex = parenStart + 2;
	const expression = source.substring(readStart, endIndex);

	return { startIndex: readStart, endIndex, expression };
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
 * Perform a binary operation.
 *
 * @param operator - the operator (+, -, *, /, %)
 * @param left - left operand
 * @param right - right operand
 * @returns result of the operation
 */
/* eslint-disable indent */
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
/* eslint-enable indent */

/**
 * Evaluate a simple arithmetic expression with a given value.
 *
 * @param value - the numeric value to use
 * @param operation - the operation string (e.g., ' + 1', ' * 2')
 * @returns the result of the operation
 */
function evaluateOperation(value: number, operation: string): number {
	const trimmed = operation.trim();
	if (!trimmed) {
		return value;
	}

	const operatorMatch = trimmed.split(' ');
	if (operatorMatch.length < 2) {
		return value;
	}

	const operator = operatorMatch[0];
	const operand = parseInt(operatorMatch[1], 10);
	return performOperation(operator, value, operand);
}

/**
 * Interpret the given source code with provided stdin.
 * This is a stub implementation that should return an exit code.
 *
 * @param source - source code to interpret
 * @param stdIn - input provided to the program
 * @returns exit code (number)
 */
export function interpret(source: string, stdIn: string): number {
	// DO NOT CALL COMPILE

	const readExpr = findReadExpression(source);
	if (readExpr === undefined) {
		// No read expression, parse as a numeric literal
		const numericPart = extractNumericPart(source);
		return parseInt(numericPart, 10);
	}

	// Parse the value from stdIn
	const readValue = parseInt(stdIn.trim(), 10);

	// Check if there are operations after read<>()
	const afterRead = source.substring(readExpr.endIndex).trim();
	if (!afterRead) {
		return readValue;
	}

	return evaluateOperation(readValue, afterRead);
}

/**
 * Generate JavaScript code for reading from stdin without operations.
 *
 * @returns generated JavaScript code
 */
function generateReadPrefixCode(): string {
	const parts = [
		"const readline = require('readline');",
		'const rl = readline.createInterface({',
		'  input: process.stdin,',
		'  output: process.stdout',
		'});',
		"rl.on('line', (line) => {",
		'  const value = parseInt(line.trim(), 10);',
	];
	return `${parts.join('\n')}\n`;
}

function generateReadOnlyCode(): string {
	const suffixParts = ['  rl.close();', '  process.exit(value);', '});'];
	return `${generateReadPrefixCode()}${suffixParts.join('\n')}`;
}

/**
 * Generate JavaScript code for reading from stdin with operations.
 *
 * @param operator - the operator (+, -, *, /, %)
 * @param operand - the operand value
 * @returns generated JavaScript code
 */
function generateReadWithOperationCode(operator: string, operand: string): string {
	const parts = [
		'  let result;',
		`  switch ('${operator}') {`,
		`    case '+': result = value + ${operand}; break;`,
		`    case '-': result = value - ${operand}; break;`,
		`    case '*': result = value * ${operand}; break;`,
		`    case '/': result = Math.floor(value / ${operand}); break;`,
		`    case '%': result = value % ${operand}; break;`,
		'    default: result = value;',
		'  }',
		'  rl.close();',
		'  process.exit(result);',
		'});',
	];
	return `${generateReadPrefixCode()}${parts.join('\n')}`;
}

/**
 * Compile the given source to a target string.
 *
 * @param source - source code to compile
 * @returns compiled target as a string
 */
export const compile = (source: string): string => {
	// DO NOT CALL INTERPRET

	const readExpr = findReadExpression(source);
	if (readExpr === undefined) {
		// No read expression, compile as a numeric literal
		const numericPart = extractNumericPart(source);
		return `process.exit(${parseInt(numericPart, 10)});`;
	}

	// Check if there are operations after read<>()
	const afterRead = source.substring(readExpr.endIndex).trim();

	if (!afterRead) {
		return generateReadOnlyCode();
	}

	// read<>() with operations
	const operatorMatch = afterRead.split(' ');
	const operator = operatorMatch[0];
	const operand = operatorMatch[1] || '0';

	return generateReadWithOperationCode(operator, operand);
};

/**
 * Execute the given target string and return an exit code.
 *
 * @param target - compiled target to execute
 * @param stdIn
 * @returns exit code (number)
 */
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
export function compileAndExecute(source: string, stdIn: string): number {
	const target = compile(source);
	const exitCode = execute(target, stdIn);
	return exitCode;
}
