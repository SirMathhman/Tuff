import { interpret } from '../src/interpret';
import { clearStructRegistry } from '../src/structs';
import { clearFunctionRegistry } from '../src/functions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const expectInterpretOk = (input: string, expected: any): void => {
	const result = interpret(input);
	expect(result.type).toBe('ok');
	if (result.type === 'ok') {
		expect(result.value).toBe(expected);
	}
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const expectInterpretErrContains = (input: string, expectedMsg: any): void => {
	const result = interpret(input);
	expect(result.type).toBe('err');
	if (result.type === 'err') {
		expect(result.error).toContain(expectedMsg);
	}
};

describe('interpret - struct destructuring', (): void => {
	beforeEach((): void => {
		clearStructRegistry();
		clearFunctionRegistry();
	});

	it('should destructure struct fields into variables', (): void => {
		expectInterpretOk(
			'struct Point { x : I32, y : I32 } let myPoint = Point { x : 3, y : 4 }; let { x, y } = myPoint; x + y',
			7,
		);
	});

	it('should destructure single field', (): void => {
		expectInterpretOk(
			'struct Wrapper { value : I32 } let w = Wrapper { value : 42 }; let { value } = w; value',
			42,
		);
	});

	it('should destructure and use in expression', (): void => {
		expectInterpretOk(
			'struct S { a : I32, b : I32 } let s = S { a : 10, b : 20 }; let { a, b } = s; a * 2 + b',
			40,
		);
	});

	it('should return Err for destructuring non-struct', (): void => {
		expectInterpretErrContains('let { x } = 42;', 'Destructuring value must be a variable name');
	});

	it('should return Err for destructuring with non-existent field', (): void => {
		expectInterpretErrContains(
			'struct Point { x : I32 } let p = Point { x : 5 }; let { x, y } = p;',
			"Field 'y' does not exist in struct Point",
		);
	});
});
