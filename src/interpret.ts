// Implementation dependencies
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync, SpawnSyncReturns } from 'child_process';

/**
 * Extract the numeric part from source code by removing type suffixes.
 *
 * @param source - source code
 * @returns numeric part as a string
 */
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
 * Interpret the given source code with provided stdin.
 * This is a stub implementation that should return an exit code.
 *
 * @param source - source code to interpret
 * @param stdIn - input provided to the program
 * @returns exit code (number)
 */
export function interpret(source: string, stdIn: string): number {
	// DO NOT CALL COMPILE

	// Check if source is a read<TYPE>() call
	if (source.includes('read<')) {
		// Parse the value from stdIn
		const value = parseInt(stdIn.trim(), 10);
		return value;
	}

	// Otherwise parse as a numeric literal
	const numericPart = extractNumericPart(source);
	return parseInt(numericPart, 10);
}

/**
 * Compile the given source to a target string.
 *
 * @param source - source code to compile
 * @returns compiled target as a string
 */
export const compile = (source: string): string => {
	// DO NOT CALL INTERPRET

	// Check if source is a read<TYPE>() call
	if (source.includes('read<')) {
		// Generate JavaScript that reads from stdin and exits with that value
		return `const readline = require('readline');
		
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

rl.on('line', (line) => {
	const value = parseInt(line.trim(), 10);
	rl.close();
	process.exit(value);
});`;
	}

	// Otherwise compile as a numeric literal
	const numericPart = extractNumericPart(source);
	return `process.exit(${parseInt(numericPart, 10)});`;
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
