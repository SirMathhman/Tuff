import { clearFunctionRegistry } from '../src/functions';
import { expectInterpretOk } from '../src/testing/test-helpers';

describe('interpret - closures', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('captures mutable variable and modifies it', (): void => {
		expectInterpretOk('let mut x = 0; fn add() => { x += 1; x }; add(); add(); x', 2);
	});

	it('closure reads captured variable', (): void => {
		expectInterpretOk('let y = 10; fn get() => y; get()', 10);
	});

	it('closure with parameter and captured var', (): void => {
		expectInterpretOk(
			'let mut sum = 0; fn addTo(n : I32) => { sum += n; sum }; addTo(5); addTo(3); sum',
			8,
		);
	});

	it('multiple closures capture same var', (): void => {
		expectInterpretOk(
			'let mut x = 1; fn double() => { x += x; x }; fn add5() => { x += 5; x }; double(); add5(); x',
			7,
		);
	});

	it('closure sees variable updates', (): void => {
		expectInterpretOk('let mut x = 1; x = 5; fn get() => x; get()', 5);
	});
});
