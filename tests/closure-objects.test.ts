import { clearFunctionRegistry } from '../src/interpreter/functions';
import { assertValid } from '../src/testing/test-helpers';

function makePointCode(withReturnType: boolean): string {
	let returnType = '';
	if (withReturnType) {
		returnType = ' : Point';
	}
	return `
        fn Point(x : I32, y : I32)${returnType} => {
            fn manhattan() => x + y;
            this
        };
        let value = Point(3, 4);
        value.manhattan()
    `;
}

describe('interpret - closure objects via this', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('allows accessing inner functions via this', (): void => {
		assertValid(makePointCode(false), 7);
	});

	it('allows accessing inner functions with explicit return type', (): void => {
		assertValid(makePointCode(true), 7);
	});
});

describe('interpret - closure objects regression tests', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('standard let still works', (): void => {
		assertValid('let value = 0; value', 0);
	});

	it('function + let still works', (): void => {
		assertValid('fn Foo() => 0; let value = 0; value', 0);
	});
});
