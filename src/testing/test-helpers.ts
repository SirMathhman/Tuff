import { type Result } from '../common/result';
import { run } from '../compiler/run';
import { interpret } from '../interpret';

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
	const result = interpret(input);
	assertValid(result, expected);
}

export function assertInterpretInvalid(input: string, expectedSubstring: string): void {
	const result = interpret(input);
	assertInvalid(result, expectedSubstring);
}

export function assertInterpretAndCompileValid(input: string, expected: number): void {
	const result = interpret(input);
	assertValid(result, expected);

	const compileResult = run(input, '');
	assertValid(compileResult, expected);
}

export function assertInterpretAndCompileInvalid(input: string, expectedSubstring: string): void {
	const result = interpret(input);
	assertInvalid(result, expectedSubstring);

	const compileResult = run(input, '');
	assertInvalid(compileResult, expectedSubstring);
}
