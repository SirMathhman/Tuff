import { interpret } from '../src/interpret';
import { assertValid, assertInvalid, assertValid } from '../src/testing/test-helpers';

describe('interpret - while loops', (): void => {
	it('should interpret "let mut x = 0; while (x < 4) x += 1; x" as 4', (): void => {
		const result = interpret('let mut x = 0; while (x < 4) x += 1; x');
		if (result.type === 'err') {
			expect(result.error).toBe('SUCCESS');
		} else {
			assertValid(result, 4);
		}
	});

	it('should interpret "let mut x = 10; while (x > 5) x -= 1; x" as 5', (): void => {
		assertValid('let mut x = 10; while (x > 5) x -= 1; x', 5);
	});

	it('should interpret "let mut x = 1; while (x < 100) x = x * 2; x" as 128', (): void => {
		assertValid('let mut x = 1; while (x < 100) x = x * 2; x', 128);
	});

	it('should interpret "let mut x = 0; while (false) x = 100; x" as 0', (): void => {
		assertValid('let mut x = 0; while (false) x = 100; x', 0);
	});

	it('should interpret "let mut sum = 0; let mut i = 1; while (i <= 5) { sum += i; i += 1; } sum" as 15', (): void => {
		assertValid('let mut sum = 0; let mut i = 1; while (i <= 5) { sum += i; i += 1; } sum', 15);
	});

	it('should interpret "let mut x = 0; while (x < 4) { x += 1; } x" as 4', (): void => {
		assertValid('let mut x = 0; while (x < 4) { x += 1; } x', 4);
	});

	it('should return Err for "let x = 0; while (true) x += 1; x" (immutable)', (): void => {
		assertInvalid(interpret('let x = 0; while (true) x += 1; x'), 'not mutable');
	});
});

describe('interpret - for loops', (): void => {
	it('should interpret "let mut sum = 0; for (let mut i in 0..10) sum += i; sum" as 45', (): void => {
		assertValid('let mut sum = 0; for (let mut i in 0..10) sum += i; sum', 45);
	});

	it('should interpret "let mut sum = 0; for (let mut i in 0..5) sum += i; sum" as 10', (): void => {
		assertValid('let mut sum = 0; for (let mut i in 0..5) sum += i; sum', 10);
	});

	it('should interpret "let mut product = 1; for (let mut i in 1..5) product *= i; product" as 24', (): void => {
		assertValid('let mut product = 1; for (let mut i in 1..5) product *= i; product', 24);
	});

	it('should interpret "let mut x = 0; for (let mut i in 0..3) x = i; x" (last iteration)', (): void => {
		assertValid('let mut x = 0; for (let mut i in 0..3) x = i; x', 2);
	});

	it('should interpret "let mut sum = 0; for (let mut i in 2..7) { sum += i; } sum" as 20', (): void => {
		assertValid('let mut sum = 0; for (let mut i in 2..7) { sum += i; } sum', 20);
	});

	it('should return Err for "let sum = 0; for (let mut i in 0..5) sum += i; sum" (immutable outer)', (): void => {
		assertInvalid(interpret('let sum = 0; for (let mut i in 0..5) sum += i; sum'), 'not mutable');
	});
});
