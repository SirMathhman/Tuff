import { type Result } from '../common/result';
import { run } from '../compiler/run';
import { clearFunctionRegistry } from '../interpreter/functions';
import { clearModuleRegistry } from '../interpreter/modules';
import { interpret } from '../interpret';
import { clearEnumRegistry } from '../types/enums';
import { clearStructRegistry } from '../types/structs';

function resetGlobalRegistriesForTesting(): void {
	clearFunctionRegistry();
	clearModuleRegistry();
	clearStructRegistry();
	clearEnumRegistry();
}

function extractErrorMessage(e: unknown): string {
	if (e instanceof Error) {
		return e.message;
	}
	return String(e);
}

function runInterpretWithErrorHandling(
	input: string,
	assertFn: (result: Result<number>) => void,
): void {
	try {
		resetGlobalRegistriesForTesting();
		const result = interpret(input);
		assertFn(result);
	} catch (e) {
		throw new Error(`Interpretation error: ${extractErrorMessage(e)}`);
	}
}

function runCompileWithErrorHandling(
	input: string,
	stdin: string,
	assertFn: (result: Result<number>) => void,
): void {
	try {
		resetGlobalRegistriesForTesting();
		const compileResult = run(input, stdin);
		assertFn(compileResult);
	} catch (e) {
		throw new Error(`Compilation error: ${extractErrorMessage(e)}`);
	}
}

export function assertValid(result: Result<number>, expected: number): void {
	if (result.type === 'err') {
		throw new Error(`Expected ok but got err: ${result.error}`);
	}
	expect(result.type).toBe('ok');
	expect(result.value).toBe(expected);
}

export function assertInvalid(result: Result<number>, expectedSubstring: string): void {
	if (result.type === 'err') {
		expect(result.error).toContain(expectedSubstring);
	}
	expect(result.type).toBe('err');
	if (result.type === 'ok') {
		throw new Error(`Expected err but got ok: ${result.value}`);
	}
}

export function assertInterpretValid(input: string, expected: number): void {
	resetGlobalRegistriesForTesting();
	const result = interpret(input);
	assertValid(result, expected);
}

export function assertInterpretInvalid(input: string, expectedSubstring: string): void {
	resetGlobalRegistriesForTesting();
	const result = interpret(input);
	assertInvalid(result, expectedSubstring);
}

export function assertCompileValid(input: string, stdIn: string, expected: number): void {
	resetGlobalRegistriesForTesting();
	const result = run(input, stdIn);
	assertValid(result, expected);
}

export function assertInterpretAndCompileValid(input: string, expected: number, stdin = ''): void {
	runInterpretWithErrorHandling(input, (result): void => assertValid(result, expected));
	runCompileWithErrorHandling(input, stdin, (result): void => assertValid(result, expected));
}

export function assertInterpretAndCompileInvalid(
	input: string,
	expectedSubstring: string,
	stdin = '',
): void {
	runInterpretWithErrorHandling(input, (result): void => assertInvalid(result, expectedSubstring));
	runCompileWithErrorHandling(input, stdin, (result): void =>
		assertInvalid(result, expectedSubstring),
	);
}
