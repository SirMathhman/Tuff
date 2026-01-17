import {
	assertInterpretAndCompileValid,
	assertInterpretAndCompileInvalid,
	assertCompileValid,
} from '../../src/testing/test-helpers';

describe('let bindings and scoping', (): void => {
	it('should interpret "{ let x = 7; x }" as 7', (): void => {
		assertInterpretAndCompileValid('{ let x = 7; x }', 7);
	});
	it('should interpret "10 / ({ let x = 7; x } - 2)" as 2', (): void => {
		assertInterpretAndCompileValid('10 / ({ let x = 7; x } - 2)', 2);
	});
	it('should interpret "{ let x = 5; x + 3 }" as 8', (): void => {
		assertInterpretAndCompileValid('{ let x = 5; x + 3 }', 8);
	});
	it('should interpret "{ let x = 10; let y = 2; x / y }" as 5', (): void => {
		assertInterpretAndCompileValid('{ let x = 10; let y = 2; x / y }', 5);
	});
	it('should return Err for undefined variable', (): void => {
		assertInterpretAndCompileInvalid('{ x }', 'Undefined');
	});
});

describe('type annotations and validation', (): void => {
	it('should interpret "{ let x : I32 = 7; x }" as 7', (): void => {
		assertInterpretAndCompileValid('{ let x : I32 = 7; x }', 7);
	});
	it('should interpret "10 / ({ let x : I32 = 7; x } - 2)" as 2', (): void => {
		assertInterpretAndCompileValid('10 / ({ let x : I32 = 7; x } - 2)', 2);
	});
	it('should return Err for out of range typed variable', (): void => {
		assertInterpretAndCompileInvalid('{ let x : U8 = 256; x }', 'out of range');
	});
	it('should interpret "{ let x : I16 = -100; x }" as -100', (): void => {
		assertInterpretAndCompileValid('{ let x : I16 = -100; x }', -100);
	});
	it('should interpret "{ let x : U32 = 1000000; x + 1 }" as 1000001', (): void => {
		assertInterpretAndCompileValid('{ let x : U32 = 1000000; x + 1 }', 1000001);
	});
	it('should return Err for "{ let x : I32 = 7; }" (no expression)', (): void => {
		assertInterpretAndCompileInvalid('{ let x : I32 = 7; }', 'expression');
	});
	it('should return Err for "10 / ({ let x : I32 = 7; } - 2)"', (): void => {
		assertInterpretAndCompileInvalid('10 / ({ let x : I32 = 7; } - 2)', 'expression');
	});
	it('should return Err for duplicate variable names', (): void => {
		assertInterpretAndCompileInvalid('{ let x = 7; let x = 20; x }', 'already defined');
	});
	it('should return Err for "10 / ({ let x = 7; let x = 20; x } - 2)"', (): void => {
		assertInterpretAndCompileInvalid('10 / ({ let x = 7; let x = 20; x } - 2)', 'already defined');
	});
	it('should interpret "10 / ({ let x = 7; let y = x; y } - 2)" as 2', (): void => {
		assertInterpretAndCompileValid('10 / ({ let x = 7; let y = x; y } - 2)', 2);
	});
});

describe('compiler-only tests with read<T>()', (): void => {
	it('should compile "{ let x : U8 = read<U8>(); x }" with stdin', (): void => {
		assertCompileValid('{ let x : U8 = read<U8>(); x }', '42', 42);
	});
	it('should compile "{ let x : I32 = read<I32>(); x + 5 }" with stdin', (): void => {
		assertCompileValid('{ let x : I32 = read<I32>(); x + 5 }', '10', 15);
	});
	it('should compile "{ let x : U8 = read<U8>(); let y : U8 = read<U8>(); x + y }" with stdin', (): void => {
		assertCompileValid('{ let x : U8 = read<U8>(); let y : U8 = read<U8>(); x + y }', '20 30', 50);
	});
	it('should compile "{ let x : I32 = read<I32>(); let y : I32 = x + 5; y * 2 }" with stdin', (): void => {
		assertCompileValid('{ let x : I32 = read<I32>(); let y : I32 = x + 5; y * 2 }', '10', 30);
	});
	it('should compile "10 / ({ let x : I32 = read<I32>(); x } - 2)" with stdin', (): void => {
		assertCompileValid('10 / ({ let x : I32 = read<I32>(); x } - 2)', '3', 10);
	});
});
