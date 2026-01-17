import { assertValid } from '../src/testing/test-helpers';

describe('interpret - match expressions', (): void => {
	it('should interpret "let x : I32 = match (100) { case 100 => 2; case _ => 3; }; x" as 2', (): void => {
		assertValid('let x : I32 = match (100) { case 100 => 2; case _ => 3; }; x', 2);
	});
});
