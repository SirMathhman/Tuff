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

	// Stub: not yet implemented
	void stdIn;
	return parseInt(source, 10);
}

// Implementation dependencies
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync, SpawnSyncReturns } from 'child_process';

/**
 * Compile the given source to a target string.
 *
 * @param source - source code to compile
 * @returns compiled target as a string
 */
export const compile = (source: string): string => {
	// DO NOT CALL INTERPRET

	// Generate JavaScript that exits with the numeric value of source
	return `process.exit(${parseInt(source, 10)});`;
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
