import { clearStructRegistry } from '../../src/types/structs';
import { clearFunctionRegistry } from '../../src/interpreter/functions';
import {
	assertCompileValid,
	assertInterpretAndCompileValid,
	assertInterpretInvalid,
} from '../../src/testing/test-helpers';

describe('struct destructuring', (): void => {
	beforeEach((): void => {
		clearStructRegistry();
		clearFunctionRegistry();
	});

	it('should destructure struct fields into variables', (): void => {
		assertInterpretAndCompileValid(
			'struct Point { x : I32, y : I32 } let myPoint = Point { x : 3, y : 4 }; let { x, y } = myPoint; x + y',
			7,
		);
	});

	it('should destructure single field', (): void => {
		assertInterpretAndCompileValid(
			'struct Wrapper { value : I32 } let w = Wrapper { value : 42 }; let { value } = w; value',
			42,
		);
	});

	it('should destructure and use in expression', (): void => {
		assertInterpretAndCompileValid(
			'struct S { a : I32, b : I32 } let s = S { a : 10, b : 20 }; let { a, b } = s; a * 2 + b',
			40,
		);
	});

	it('should return Err for destructuring non-struct', (): void => {
		assertInterpretInvalid('let { x } = 42;', 'Destructuring value must be a variable name');
	});

	it('should return Err for destructuring with non-existent field', (): void => {
		assertInterpretInvalid(
			'struct Point { x : I32 } let p = Point { x : 5 }; let { x, y } = p;',
			"Field 'y' does not exist in struct Point",
		);
	});
});

describe('struct destructuring - compiler read<T>() tests', (): void => {
	beforeEach((): void => {
		clearStructRegistry();
		clearFunctionRegistry();
	});

	it('destructures struct with runtime field', (): void => {
		assertCompileValid(
			'struct Point { x : I32, y : I32 } let p = Point { x : read<I32>(), y : 5 }; let { x, y } = p; x + y',
			'10',
			15,
		);
	});
});
