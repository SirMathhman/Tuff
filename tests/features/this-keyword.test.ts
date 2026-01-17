import { clearFunctionRegistry } from '../../src/interpreter/functions';
import { assertCompileValid, assertInterpretAndCompileValid } from '../../src/testing/test-helpers';

describe('this keyword - field access', (): void => {
	it('allows this.field to access current scope variables', (): void => {
		assertInterpretAndCompileValid('let x = 100; this.x', 100);
	});

	it('works with multiple variables', (): void => {
		assertInterpretAndCompileValid('let x = 10; let y = 20; this.x + this.y', 30);
	});
});

describe('this keyword - field assignment', (): void => {
	it('allows this.field to assign to current scope variables', (): void => {
		assertInterpretAndCompileValid('let mut x = 0; this.x = 100; x', 100);
	});

	it('matches the exact user example', (): void => {
		assertInterpretAndCompileValid('let mut x = 0; this.x = 100; x', 100);
	});
});

describe('this keyword - This type', (): void => {
	it('allows storing this in a variable with This type', (): void => {
		assertInterpretAndCompileValid(
			'let x = 100; let y = 200; let temp : This = this; temp.x + temp.y',
			300,
		);
	});

	it('matches the second user example', (): void => {
		assertInterpretAndCompileValid(
			'let x = 100; let y = 200; let temp : This = this; temp.x + temp.y',
			300,
		);
	});
});

describe('this keyword - constructor functions', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('allows constructor functions that return this', (): void => {
		assertInterpretAndCompileValid(
			'fn Point(x : I32, y : I32) : Point => this; let temp : Point = Point(3, 4); temp.x',
			3,
		);
	});

	it('accesses constructor fields correctly', (): void => {
		assertInterpretAndCompileValid(
			'fn Point(x : I32, y : I32) : Point => this; let temp : Point = Point(3, 4); temp.y',
			4,
		);
	});

	it('works with multiple constructor calls', (): void => {
		assertInterpretAndCompileValid(
			'fn Point(x : I32, y : I32) : Point => this; let p1 : Point = Point(3, 4); let p2 : Point = Point(10, 20); p1.x + p2.y',
			23,
		);
	});

	it('matches the exact third user example', (): void => {
		assertInterpretAndCompileValid(
			'fn Point(x : I32, y : I32) : Point => this; let temp : Point = Point(3, 4); temp.x',
			3,
		);
	});
});

describe('this keyword - method calls on this', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('allows calling functions via this.functionName()', (): void => {
		assertInterpretAndCompileValid('fn get() => 100; this.get()', 100);
	});
});

describe('this keyword - compiler read<T>() tests', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('this.field with runtime input', (): void => {
		assertCompileValid('let x = read<I32>(); this.x', '42', 42);
	});

	it('constructor with runtime input', (): void => {
		assertCompileValid(
			'fn Point(x : I32, y : I32) : Point => this; let temp : Point = Point(read<I32>(), 5); temp.x',
			'10',
			10,
		);
	});
});
