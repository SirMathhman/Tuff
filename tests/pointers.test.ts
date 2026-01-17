import { assertInterpretValid, assertInterpretInvalid } from '../src/testing/test-helpers';

describe('interpret - pointers and dereference', (): void => {
	it('should dereference a pointer to an immutable binding', (): void => {
		assertInterpretValid('let x : I32 = 42; let p : *I32 = &x; *p', 42);
	});

	it('should dereference a pointer to a mutable binding', (): void => {
		assertInterpretValid('let mut x : I32 = 42; let p : *mut I32 = &x; *p', 42);
	});

	it('should dereference and use in arithmetic', (): void => {
		assertInterpretValid('let x : I32 = 10; let p : *I32 = &x; *p + 5', 15);
	});

	it('should dereference multiple times in expression', (): void => {
		assertInterpretValid('let x : I32 = 5; let p : *I32 = &x; *p + *p', 10);
	});

	it('should return Err for dereferencing non-pointer', (): void => {
		assertInterpretInvalid('let x : I32 = 42; *x', 'not a pointer');
	});

	it('should return Err for dereferencing undefined variable', (): void => {
		assertInterpretInvalid('*undefined', 'is not defined');
	});

	it('should dereference pointer through mutable reference', (): void => {
		assertInterpretValid('let mut x : I32 = 100; let mut p : *mut I32 = &x; *p', 100);
	});
});
