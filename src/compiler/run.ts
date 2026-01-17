import { execSync, type ExecSyncOptionsWithStringEncoding } from 'child_process';
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { compile } from './compile';
import { type Result, err, ok } from '../common/result';

interface ExecError {
	status: number;
	stdout?: string;
	stderr?: string;
	message?: string;
}

interface ExecutionResult {
	output: string;
	exitCode: number;
	errorOutput?: string;
}

function hasStatusProperty(e: object): e is ExecError {
	return 'status' in e;
}

function isExecError(e: unknown): e is ExecError {
	if (typeof e !== 'object') {
		return false;
	}
	if (!e) {
		return false;
	}
	return hasStatusProperty(e);
}

function cleanup(tempFile: string | undefined, tempDir: string | undefined): void {
	if (tempFile !== undefined) {
		try {
			unlinkSync(tempFile);
		} catch {
			// Ignore cleanup errors
		}
	}
	if (tempDir !== undefined) {
		try {
			rmdirSync(tempDir);
		} catch {
			// Ignore cleanup errors
		}
	}
}

function executeNode(tempFile: string, stdin: string): ExecutionResult {
	let output: string;
	let exitCode = 0;
	let errorOutput: string | undefined;

	const env = process.env;
	env.NODE_NO_COLORS = '1';

	const execOptions: ExecSyncOptionsWithStringEncoding = {
		stdio: ['pipe', 'pipe', 'pipe'], // capture stdout and stderr
		cwd: process.cwd(),
		input: stdin,
		encoding: 'utf8',
		env,
	};

	try {
		output = execSync(`node "${tempFile}"`, execOptions);
	} catch (execError: unknown) {
		if (isExecError(execError)) {
			exitCode = execError.status;
			output = execError.stdout ?? '';
			errorOutput = execError.stderr ?? execError.message;
		} else {
			throw execError;
		}
	}

	return { output, exitCode, errorOutput };
}

function isAnsiEscape(text: string, pos: number): boolean {
	return text[pos] === '\u001b' && text[pos + 1] === '[';
}

function findAnsiEnd(text: string, pos: number): number {
	let i = pos;
	while (i < text.length && text[i] !== 'm') {
		i++;
	}
	return i + 1; // Include the 'm'
}

function stripAnsiCodes(text: string): string {
	let result = '';
	let i = 0;
	while (i < text.length) {
		if (isAnsiEscape(text, i)) {
			i = findAnsiEnd(text, i);
		} else {
			result += text[i];
			i++;
		}
	}
	return result;
}

function parseExecutionOutput(output: string): Result<number> {
	const trimmed = output.trim();
	if (!trimmed) {
		return err('No output from compiled code');
	}

	const stripped = stripAnsiCodes(trimmed);
	const lines = stripped.split('\n');
	if (lines.length === 0) {
		return err('No output lines');
	}

	const lastLine = lines[lines.length - 1].trim();
	if (!lastLine) {
		return err(`Last line is empty. All lines: ${JSON.stringify(lines)}`);
	}

	const resultValue = Number(lastLine);
	if (Number.isNaN(resultValue)) {
		return err(`Failed to parse result value: "${lastLine}"`);
	}

	return ok(resultValue);
}

function tryExtractErrorMessageFromLine(line: string): string | undefined {
	const marker = 'Error:';
	const idx = line.indexOf(marker);
	if (idx === -1) {
		return undefined;
	}
	const message = line.substring(idx + marker.length).trim();
	if (!message) {
		return undefined;
	}
	return message;
}

function extractErrorMessage(errorOutput: string): string | undefined {
	const lines = errorOutput.split('\n');
	for (const line of lines) {
		const message = tryExtractErrorMessageFromLine(line);
		if (message !== undefined) {
			return message;
		}
	}
	return undefined;
}

function parseNodeExecutionError(
	exitCode: number,
	errorOutput: string | undefined,
): Result<number> | undefined {
	if (exitCode === 0) {
		return undefined;
	}
	if (errorOutput === undefined) {
		return err('Compiled code failed with non-zero exit code');
	}
	const message = extractErrorMessage(errorOutput);
	if (message !== undefined) {
		return err(message);
	}
	return err(errorOutput);
}

/**
 * Compiles and runs Tuff source code by generating JavaScript and executing it with Node.js.
 *
 * @param input - The Tuff source code to compile and run
 * @param stdin - Standard input to pass to the process
 * @returns A Result containing the numeric result value of the executed program
 */
export function run(input: string, stdin: string): Result<number> {
	// DO NOT CHANGE THIS. COMPILE MUST BE THE FIRST CALL.
	// THIS BEATS THE POINT OF THIS FUNCTION.
	// DO NOT FALLBACK TO THE INTERPRETER, but you can reuse code from it.

	const compileResult = compile(input);
	if (compileResult.type === 'err') {
		return compileResult;
	}

	const jsCode = compileResult.value;
	let tempDir: string | undefined;
	let tempFile: string | undefined;

	try {
		tempDir = mkdtempSync(join(tmpdir(), 'tuff-'));
		tempFile = join(tempDir, 'compiled.js');
		writeFileSync(tempFile, jsCode, 'utf8');

		const { output, exitCode, errorOutput } = executeNode(tempFile, stdin);

		const errorResult = parseNodeExecutionError(exitCode, errorOutput);
		if (errorResult !== undefined) {
			return errorResult;
		}

		return parseExecutionOutput(output);
	} catch (e: unknown) {
		if (e instanceof Error) {
			return err(`Failed to run compiled code: ${e.message}`);
		}
		return err('Failed to run compiled code: unknown error');
	} finally {
		cleanup(tempFile, tempDir);
	}
}
