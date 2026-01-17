import { assertValid, assertInterpretInvalid } from '../src/testing/test-helpers';

describe('interpret - variable declarations', (): void => {
	it('should interpret "let z = 7; z" as 7', (): void => {
		assertValid('let z = 7; z', 7);
	});

	it('should interpret "let z = 1 + 1; z" as 2', (): void => {
		assertValid('let z = 1 + 1; z', 2);
	});

	it('should interpret "let z = 10 / ({ let x = 7; let y = x; y } - 2); z" as 2', (): void => {
		assertValid('let z = 10 / ({ let x = 7; let y = x; y } - 2); z', 2);
	});

	it('should interpret "let x = { let y = 100; y }; x" as 100', (): void => {
		assertValid('let x = { let y = 100; y }; x', 100);
	});
});

describe('interpret - uninitialized variables', (): void => {
	it('should interpret "let x : I32; x = 2; x" as 2', (): void => {
		assertValid('let x : I32; x = 2; x', 2);
	});

	it('should return Err for uninitialized variable usage', (): void => {
		assertInterpretInvalid('let x : I32; x', 'not initialized');
	});

	it('should interpret "let x : I32; x = 5; x + 3" as 8', (): void => {
		assertValid('let x : I32; x = 5; x + 3', 8);
	});
});

describe('interpret - variable validation', (): void => {
	it('should return Err for duplicate variable names', (): void => {
		assertInterpretInvalid('{ let x = 7; let x = 20; x }', 'already defined');
	});

	it('should return Err for "10 / ({ let x = 7; let x = 20; x } - 2)"', (): void => {
		assertInterpretInvalid('10 / ({ let x = 7; let x = 20; x } - 2)', 'already defined');
	});
});

describe('interpret - mutability', (): void => {
	it('should interpret "let mut x = 0; x = 100; x" as 100', (): void => {
		assertValid('let mut x = 0; x = 100; x', 100);
	});

	it('should interpret "let mut x = 5; x += 1; x" as 6', (): void => {
		assertValid('let mut x = 5; x += 1; x', 6);
	});

	it('should interpret "let mut x = 5; x+=1; x" as 6 (no spaces)', (): void => {
		assertValid('let mut x = 5; x+=1; x', 6);
	});

	it('should interpret "let mut x = 5; x = x + 1; x" as 6', (): void => {
		assertValid('let mut x = 5; x = x + 1; x', 6);
	});

	it('should interpret "let mut x = 0; x += 1; x" as 1', (): void => {
		assertValid('let mut x = 0; x += 1; x', 1);
	});

	it('should return Err for "let x = 0; x = 100; x" (immutable)', (): void => {
		assertInterpretInvalid('let x = 0; x = 100; x', 'not mutable');
	});

	it('should return Err for "let x : I32 = 0; x = 100; x = 2; x" (immutable with type)', (): void => {
		assertInterpretInvalid('let x : I32 = 0; x = 100; x = 2; x', 'not mutable');
	});

	it('should interpret "let mut x : I32 = 0; x = 100; x = 2; x" as 2', (): void => {
		assertValid('let mut x : I32 = 0; x = 100; x = 2; x', 2);
	});
});

describe('interpret - scoping and mutations', (): void => {
	it('should interpret "let mut x = 0; { x = 100; } x" as 100', (): void => {
		assertValid('let mut x = 0; { x = 100; } x', 100);
	});

	it('should return Err for "{ let mut x = 0; } x = 100; x" (x only mutable in block scope)', (): void => {
		assertInterpretInvalid('{ let mut x = 0; } x = 100; x', 'Undefined');
	});
});
