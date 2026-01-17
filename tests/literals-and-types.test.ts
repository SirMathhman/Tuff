import { assertValid, assertInterpretInvalid } from '../src/testing/test-helpers';

describe('interpret - typed integer literals', (): void => {
	it('should interpret "100" as 100', (): void => {
		assertValid('100', 100);
	});

	it('should interpret "100U8" as 100', (): void => {
		assertValid('100U8', 100);
	});

	it('should return Err for "-100U8"', (): void => {
		assertInterpretInvalid('-100U8', 'Negative');
	});

	it('should return Err for "256U8"', (): void => {
		assertInterpretInvalid('256U8', 'out of range');
	});
});

describe('interpret - type annotations', (): void => {
	it('should interpret "{ let x : I32 = 7; x }" as 7', (): void => {
		assertValid('{ let x : I32 = 7; x }', 7);
	});

	it('should return Err for out of range typed variable', (): void => {
		assertInterpretInvalid('{ let x : U8 = 256; x }', 'out of range');
	});

	it('should interpret "{ let x : I16 = -100; x }" as -100', (): void => {
		assertValid('{ let x : I16 = -100; x }', -100);
	});

	it('should interpret "{ let x : U32 = 1000000; x + 1 }" as 1000001', (): void => {
		assertValid('{ let x : U32 = 1000000; x + 1 }', 1000001);
	});
});

describe('interpret - type validation', (): void => {
	it('should interpret "1U8 + 2U8" as 3', (): void => {
		assertValid('1U8 + 2U8', 3);
	});

	it('should interpret "1 + 2U8" as 3', (): void => {
		assertValid('1 + 2U8', 3);
	});

	it('should interpret "1U8 + 2" as 3', (): void => {
		assertValid('1U8 + 2', 3);
	});

	it('should return Err for "1U8 + 255"', (): void => {
		assertInterpretInvalid('1U8 + 255', 'out of range');
	});

	it('should interpret "1U8 + 2U16" as 3', (): void => {
		assertValid('1U8 + 2U16', 3);
	});

	it('should return Err for "1U8 + 65535U16"', (): void => {
		assertInterpretInvalid('1U8 + 65535U16', 'out of range');
	});

	it('should interpret "1U8 + 255U16" as 256', (): void => {
		assertValid('1U8 + 255U16', 256);
	});

	it('should interpret "255U16 + 1U8" as 256', (): void => {
		assertValid('255U16 + 1U8', 256);
	});

	it('should return Err for "254 + 1U8 + 1"', (): void => {
		assertInterpretInvalid('254 + 1U8 + 1', 'out of range');
	});

	it('should return Err for "1U8 - 2"', (): void => {
		assertInterpretInvalid('1U8 - 2', 'out of range');
	});

	it('should interpret "1I8 - 2" as -1', (): void => {
		assertValid('1I8 - 2', -1);
	});
});
