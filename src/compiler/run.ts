import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { compile } from './compile';
import { type Result, err, ok } from '../common/result';

interface ExecError {
	status: number;
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

/**
 * Compiles and runs Tuff source code by generating JavaScript and executing it with Node.js.
 *
 * @param input - The Tuff source code to compile and run
 * @param stdin - Standard input to pass to the process
 * @returns A Result containing the exit code of the executed process
 */
export function run(input: string, stdin: string): Result<number> {
	// DO NOT CHANGE THIS. COMPILE MUST BE THE FIRST CALL.
	// THIS BEATS THE POINT OF THIS FUNCTION.
	// DO NOT FALLBACK TO THE INTERPRETER, but you can reuse code from it.

	// Otherwise, use the compiled JavaScript approach
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
		execSync(`node "${tempFile}"`, {
			stdio: ['pipe', 'inherit', 'inherit'],
			cwd: process.cwd(),
			input: stdin,
		});
		return ok(0);
	} catch (e: unknown) {
		if (isExecError(e)) {
			return ok(e.status);
		}
		if (e instanceof Error) {
			return err(`Failed to run compiled code: ${e.message}`);
		}
		return err('Failed to run compiled code: unknown error');
	} finally {
		cleanup(tempFile, tempDir);
	}
}
