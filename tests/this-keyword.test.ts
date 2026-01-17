import { clearFunctionRegistry } from '../src/functions';
import { expectInterpretOk } from '../src/testing/test-helpers';

describe('interpret - this keyword - field access', (): void => {
	it('allows this.field to access current scope variables', (): void => {
		expectInterpretOk('let x = 100; this.x', 100);
	});

	it('works with multiple variables', (): void => {
		expectInterpretOk('let x = 10; let y = 20; this.x + this.y', 30);
	});
});

describe('interpret - this keyword - field assignment', (): void => {
	it('allows this.field to assign to current scope variables', (): void => {
		expectInterpretOk('let mut x = 0; this.x = 100; x', 100);
	});

	it('matches the exact user example', (): void => {
		expectInterpretOk('let mut x = 0; this.x = 100; x', 100);
	});
});

describe('interpret - this keyword - This type', (): void => {
	it('allows storing this in a variable with This type', (): void => {
		expectInterpretOk('let x = 100; let y = 200; let temp : This = this; temp.x + temp.y', 300);
	});

	it('matches the second user example', (): void => {
		expectInterpretOk('let x = 100; let y = 200; let temp : This = this; temp.x + temp.y', 300);
	});
});

describe('interpret - this keyword - constructor functions', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('allows constructor functions that return this', (): void => {
		expectInterpretOk(
			'fn Point(x : I32, y : I32) : Point => this; let temp : Point = Point(3, 4); temp.x',
			3,
		);
	});

	it('accesses constructor fields correctly', (): void => {
		expectInterpretOk(
			'fn Point(x : I32, y : I32) : Point => this; let temp : Point = Point(3, 4); temp.y',
			4,
		);
	});

	it('works with multiple constructor calls', (): void => {
		expectInterpretOk(
			'fn Point(x : I32, y : I32) : Point => this; let p1 : Point = Point(3, 4); let p2 : Point = Point(10, 20); p1.x + p2.y',
			23,
		);
	});

	it('matches the exact third user example', (): void => {
		expectInterpretOk(
			'fn Point(x : I32, y : I32) : Point => this; let temp : Point = Point(3, 4); temp.x',
			3,
		);
	});
});

describe('interpret - this keyword - method calls on this', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('allows calling functions via this.functionName()', (): void => {
		expectInterpretOk('fn get() => 100; this.get()', 100);
	});
});
