import { assertValid, assertInterpretInvalid } from '../src/testing/test-helpers';

describe('interpret - basic arithmetic', (): void => {
	it('should interpret "1 + 2 + 3" as 6', (): void => {
		assertValid('1 + 2 + 3', 6);
	});

	it('should interpret "2 + 3 - 4" as 1', (): void => {
		assertValid('2 + 3 - 4', 1);
	});

	it('should interpret "2 * 3 - 4" as 2', (): void => {
		assertValid('2 * 3 - 4', 2);
	});

	it('should interpret "4 + 2 * 3" as 10', (): void => {
		assertValid('4 + 2 * 3', 10);
	});
});

describe('interpret - parentheses and division', (): void => {
	it('should interpret "(4)" as 4', (): void => {
		assertValid('(4)', 4);
	});

	it('should interpret "(4 + 2) * 3" as 18', (): void => {
		assertValid('(4 + 2) * 3', 18);
	});

	it('should interpret "1 + (4 + 2) * 3" as 19', (): void => {
		assertValid('1 + (4 + 2) * 3', 19);
	});

	it('should return Err for "10 / (2 - 2)"', (): void => {
		assertInterpretInvalid('10 / (2 - 2)', 'Division by zero');
	});
});
