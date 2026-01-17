import { interpret } from '../src/interpret';

function expectInterpretOk(input: string, expected: number): void {
	const result = interpret(input);
	expect(result.type).toBe('ok');
	if (result.type === 'ok') {
		expect(result.value).toBe(expected);
	}
}

function expectInterpretErrContains(input: string, expectedMessage: string): void {
	const result = interpret(input);
	expect(result.type).toBe('err');
	if (result.type === 'err') {
		expect(result.error).toContain(expectedMessage);
	}
}

describe('interpret - arrays', (): void => {
	it('should interpret array literal and access elements', (): void => {
		expectInterpretOk('let array : [I32; 3; 3] = [1, 2, 3]; array[0] + array[1] + array[2]', 6);
	});

	it('should interpret single array element access', (): void => {
		expectInterpretOk('let array : [I32; 3; 3] = [1, 2, 3]; array[0]', 1);
	});

	it('should interpret middle array element access', (): void => {
		expectInterpretOk('let array : [I32; 3; 3] = [1, 2, 3]; array[1]', 2);
	});

	it('should interpret last array element access', (): void => {
		expectInterpretOk('let array : [I32; 3; 3] = [1, 2, 3]; array[2]', 3);
	});

	it('should return Err for negative array index', (): void => {
		expectInterpretErrContains('let array : [I32; 3; 3] = [1, 2, 3]; array[-1]', 'out of bounds');
	});

	it('should return Err for out of bounds array index', (): void => {
		expectInterpretErrContains('let array : [I32; 3; 3] = [1, 2, 3]; array[3]', 'out of bounds');
	});

	it('should interpret array with typed elements U8', (): void => {
		expectInterpretOk('let array : [U8; 2; 2] = [100U8, 150U8]; array[0] + array[1]', 250);
	});

	it('should return Err for typed array element out of range', (): void => {
		expectInterpretErrContains('let array : [U8; 2; 2] = [100U8, 256U8]; array[1]', 'out of range');
	});

	it('should return Err for array initialization count mismatch', (): void => {
		expectInterpretErrContains(
			'let array : [I32; 3; 3] = [1, 2]; array[0]',
			'Array initialization count mismatch',
		);
	});

	it('should interpret array with expressions', (): void => {
		expectInterpretOk('let array : [I32; 3; 3] = [1 + 1, 2 + 2, 3 + 3]; array[0] + array[1]', 6);
	});

	it('should interpret array with computed elements in expression', (): void => {
		expectInterpretOk('let array : [I32; 2; 2] = [10, 20]; let index : I32 = 1; array[index]', 20);
	});
});
