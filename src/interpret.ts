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
 * Evaluate a full arithmetic expression with proper order of operations.
 *
 * @param expr - arithmetic expression string (e.g., '1 + 2', '5 * 3 - 1')
 * @returns result of the expression
 */
function evaluateExpression(expr: string): number {
	// Parse expression with operator precedence (* and / before + and -)
	const trimmed = expr.trim();
	const parts = trimmed.split(' ').filter((p: string): boolean => Boolean(p));

	if (parts.length === 1) {
		return parseInt(parts[0], 10);
	}

	// First pass: handle * and / (higher precedence)
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

	// Second pass: handle + and - (lower precedence)
	let result = parseInt(parts[0], 10);
	for (let j = 1; j < parts.length; j += 2) {
		const operator = parts[j];
		const operand = parseInt(parts[j + 1], 10);
		result = performOperation(operator, result, operand);
	}

	return result;
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

	const readExprs = findAllReadExpressions(source);
	if (readExprs.length === 0) {
		// No read expression, parse as a numeric literal
		const numericPart = extractNumericPart(source);
		return parseInt(numericPart, 10);
	}

	// Parse all values from stdIn (space-separated)
	const stdinValues = stdIn
		.trim()
		.split(' ')
		.map((v: string): number => parseInt(v, 10));

	// Replace each read<>() with its corresponding value
	let evaluatedSource = source;
	for (let i = 0; i < readExprs.length; i++) {
		evaluatedSource = evaluatedSource.replace(readExprs[i].expression, String(stdinValues[i]));
	}

	// Now evaluate the expression with numeric values
	const numericPart = extractNumericPart(evaluatedSource);
	if (numericPart === evaluatedSource.trim()) {
		// It's just a number
		return parseInt(numericPart, 10);
	}

	// It has operations - parse and evaluate
	return evaluateExpression(evaluatedSource);
}

/**
 * Generate code for single read<>() without operations.
 *
 * @returns generated JavaScript code
 */
function generateSingleReadCode(): string {
	const parts = [
		"const readline = require('readline');",
		'const rl = readline.createInterface({',
		'  input: process.stdin,',
		'  output: process.stdout',
		'});',
		"rl.on('line', (line) => {",
		'  const value = parseInt(line.trim(), 10);',
		'  rl.close();',
		'  process.exit(value);',
		'});',
	];
	return parts.join('\n');
}

/**
 * Generate code for single read<>() with an operation.
 *
 * @param operator - the operator (+, -, *, /, %)
 * @param operand - the operand value
 * @returns generated JavaScript code
 */
function generateSingleReadWithOp(operator: string, operand: string): string {
	const parts = [
		"const readline = require('readline');",
		'const rl = readline.createInterface({',
		'  input: process.stdin,',
		'  output: process.stdout',
		'});',
		"rl.on('line', (line) => {",
		'  const value = parseInt(line.trim(), 10);',
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
	return parts.join('\n');
}

/**
 * Generate code for processing and evaluating tokens with operator precedence.
 *
 * @returns JavaScript code as string
 */
function generateTokenProcessingCode(): string {
	return `
  const processAndEvaluate = (tokens, values) => {
    for (let idx = 0; idx < tokens.length; idx++) {
      const t = tokens[idx];
      if (t.startsWith("values[") && t.endsWith("]")) {
        const valIdx = parseInt(t.substring(7, t.length - 1), 10);
        tokens[idx] = values[valIdx].toString();
      }
    }
    let i = 0;
    while (i < tokens.length) {
      const isMultDiv = i > 0 && i < tokens.length - 1 && (tokens[i] === "*" || tokens[i] === "/");
      if (isMultDiv) {
        const left = parseInt(tokens[i - 1], 10);
        const operator = tokens[i];
        const right = parseInt(tokens[i + 1], 10);
        let res = operator === "*" ? left * right : Math.floor(left / right);
        tokens.splice(i - 1, 3, res.toString());
      } else {
        i++;
      }
    }
    let result = parseInt(tokens[0], 10);
    for (let j = 1; j < tokens.length; j += 2) {
      const operator = tokens[j];
      const operand = parseInt(tokens[j + 1], 10);
      switch (operator) {
        case '+': result = result + operand; break;
        case '-': result = result - operand; break;
        case '%': result = result % operand; break;
      }
    }
    return result;
  };`;
}

/**
 * Generate code for multiple read<>() calls.
 *
 * @param source - source with read<>() placeholders
 * @returns generated JavaScript code
 */
function generateMultiReadCode(source: string): string {
	const processingCode = generateTokenProcessingCode();
	const parts = [
		"const readline = require('readline');",
		'const rl = readline.createInterface({',
		'  input: process.stdin,',
		'  output: process.stdout',
		'});',
		'let allInput = "";',
		"rl.on('line', (line) => {",
		'  allInput += line + " ";',
		'});',
		'rl.on("close", () => {',
		'  const values = allInput.trim().split(" ").map(v => parseInt(v, 10));',
		'  const expr = ' + `'${source}'` + ';',
		'  const tokens = expr.split(" ").filter(t => t);',
		processingCode,
		'  const result = processAndEvaluate(tokens, values);',
		'  process.exit(result);',
		'});',
	];
	return parts.join('\n');
}

/**
 * Compile the given source to a target string.
 *
 * @param source - source code to compile
 * @returns compiled target as a string
 */
export const compile = (source: string): string => {
	// DO NOT CALL INTERPRET

	const readExprs = findAllReadExpressions(source);
	if (readExprs.length === 0) {
		// No read expression, compile as a numeric literal
		const numericPart = extractNumericPart(source);
		return `process.exit(${parseInt(numericPart, 10)});`;
	}

	if (readExprs.length === 1) {
		// Single read<>() call - use optimized path
		const readExpr = readExprs[0];
		const afterRead = source.substring(readExpr.endIndex).trim();

		if (!afterRead) {
			return generateSingleReadCode();
		}

		// read<>() with single operation
		const operatorMatch = afterRead.split(' ');
		const operator = operatorMatch[0];
		const operand = operatorMatch[1] || '0';
		return generateSingleReadWithOp(operator, operand);
	}

	// Multiple read<>() calls - replace them with array indices and evaluate
	let replacedSource = source;
	for (let i = 0; i < readExprs.length; i++) {
		replacedSource = replacedSource.replace(readExprs[i].expression, `values[${i}]`);
	}

	return generateMultiReadCode(replacedSource);
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
export function compileAndExecute(source: string, stdIn: string): number {
	const target = compile(source);
	const exitCode = execute(target, stdIn);
	return exitCode;
}
