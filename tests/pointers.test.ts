import { type Result } from '../src/common/result';
import { interpret } from '../src/interpret';

// CPD-OFF - duplication with interpret.test.ts is intentional for test isolation
function expectOkValue(result: Result<number>, expected: number): void {
	if (result.type === 'err') {
		console.error('Expected ok but got err:', result.error);
	}
	expect(result.type).toBe('ok');
	if (result.type === 'ok') {
		expect(result.value).toBe(expected);
	}
}

function expectErrContains(result: Result<number>, expectedSubstring: string): void {
	if (result.type === 'err') {
		expect(result.error).toContain(expectedSubstring);
	}
	expect(result.type).toBe('err');
	if (result.type === 'ok') {
		console.error('Expected err but got ok:', result.value);
	}
}

function expectInterpretOk(input: string, expected: number): void {
	const result = interpret(input);
	expectOkValue(result, expected);
}

function expectInterpretErrContains(input: string, expectedSubstring: string): void {
	const result = interpret(input);
	expectErrContains(result, expectedSubstring);
}

describe('interpret - pointers and dereference', (): void => {
	it('should dereference a pointer to an immutable binding', (): void => {
		expectInterpretOk('let x : I32 = 42; let p : *I32 = &x; *p', 42);
	});

	it('should dereference a pointer to a mutable binding', (): void => {
		expectInterpretOk('let mut x : I32 = 42; let p : *mut I32 = &x; *p', 42);
	});

	it('should dereference and use in arithmetic', (): void => {
		expectInterpretOk('let x : I32 = 10; let p : *I32 = &x; *p + 5', 15);
	});

	it('should dereference multiple times in expression', (): void => {
		expectInterpretOk('let x : I32 = 5; let p : *I32 = &x; *p + *p', 10);
	});

	it('should return Err for dereferencing non-pointer', (): void => {
		expectInterpretErrContains('let x : I32 = 42; *x', 'not a pointer');
	});

	it('should return Err for dereferencing undefined variable', (): void => {
		expectInterpretErrContains('*undefined', 'is not defined');
	});

	it('should dereference pointer through mutable reference', (): void => {
		expectInterpretOk('let mut x : I32 = 100; let mut p : *mut I32 = &x; *p', 100);
	});
});
// CPD-ON
