import { type Result } from '../common/result';
import { interpret } from '../interpret';

export function expectOkValue(result: Result<number>, expected: number): void {
	if (result.type === 'err') {
		console.error('Expected ok but got err:', result.error);
	}
	expect(result.type).toBe('ok');
	if (result.type === 'ok') {
		expect(result.value).toBe(expected);
	}
}

export function expectErrContains(result: Result<number>, expectedSubstring: string): void {
	if (result.type === 'err') {
		expect(result.error).toContain(expectedSubstring);
	}
	expect(result.type).toBe('err');
	if (result.type === 'ok') {
		console.error('Expected err but got ok:', result.value);
	}
}

export function expectInterpretOk(input: string, expected: number): void {
	const result = interpret(input);
	expectOkValue(result, expected);
}

export function expectInterpretErrContains(input: string, expectedSubstring: string): void {
	const result = interpret(input);
	expectErrContains(result, expectedSubstring);
}
