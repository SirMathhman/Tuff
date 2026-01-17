import { assertValid, assertInterpretInvalid } from '../src/testing/test-helpers';

describe('interpret - block expressions', (): void => {
	it('should interpret "{ 7 }" as 7', (): void => {
		assertValid('{ 7 }', 7);
	});

	it('should interpret "10 / ({ 7 } - 2)" as 2', (): void => {
		assertValid('10 / ({ 7 } - 2)', 2);
	});

	it('should interpret "{ 2 } * 3 + 1" as 7', (): void => {
		assertValid('{ 2 } * 3 + 1', 7);
	});

	it('should interpret "1 + { 4 + 2 } * 3" as 19', (): void => {
		assertValid('1 + { 4 + 2 } * 3', 19);
	});
});

describe('interpret - blocks with bindings', (): void => {
	it('should interpret "{ let x = 7; x }" as 7', (): void => {
		assertValid('{ let x = 7; x }', 7);
	});

	it('should interpret "10 / ({ let x = 7; x } - 2)" as 2', (): void => {
		assertValid('10 / ({ let x = 7; x } - 2)', 2);
	});

	it('should interpret "{ let x = 5; x + 3 }" as 8', (): void => {
		assertValid('{ let x = 5; x + 3 }', 8);
	});

	it('should interpret "{ let x = 10; let y = 3; x / y }" as 3', (): void => {
		assertValid('{ let x = 10; let y = 3; x / y }', 3);
	});

	it('should interpret "10 / ({ let x = 7; let y = x; y } - 2)" as 2', (): void => {
		assertValid('10 / ({ let x = 7; let y = x; y } - 2)', 2);
	});
});

describe('interpret - block validation', (): void => {
	it('should return Err for "{ let x : I32 = 7; }" (no expression)', (): void => {
		assertInterpretInvalid('{ let x : I32 = 7; }', 'expression');
	});

	it('should return Err for "10 / ({ let x : I32 = 7; } - 2)"', (): void => {
		assertInterpretInvalid('10 / ({ let x : I32 = 7; } - 2)', 'expression');
	});

	it('should return Err for undefined variable in block', (): void => {
		assertInterpretInvalid('{ x }', 'Undefined');
	});
});
