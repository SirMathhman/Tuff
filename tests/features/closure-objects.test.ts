import { clearFunctionRegistry } from '../../src/interpreter/functions';
import { assertInterpretAndCompileValid } from '../../src/testing/test-helpers';

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

describe('closure objects via this', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('allows accessing inner functions via this', (): void => {
		assertInterpretAndCompileValid(makePointCode(false), 7);
	});

	it('allows accessing inner functions with explicit return type', (): void => {
		assertInterpretAndCompileValid(makePointCode(true), 7);
	});
});

describe('closure objects regression tests', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('standard let still works', (): void => {
		assertInterpretAndCompileValid('let value = 0; value', 0);
	});

	it('function + let still works', (): void => {
		assertInterpretAndCompileValid('fn Foo() => 0; let value = 0; value', 0);
	});
});
