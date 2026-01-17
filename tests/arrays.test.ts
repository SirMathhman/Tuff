import { assertValid, assertInterpretInvalid } from '../src/testing/test-helpers';

describe('interpret - arrays - basic', (): void => {
	it('should interpret array literal and access elements', (): void => {
		assertValid('let array : [I32; 3; 3] = [1, 2, 3]; array[0] + array[1] + array[2]', 6);
	});

	it('should interpret single array element access', (): void => {
		assertValid('let array : [I32; 3; 3] = [1, 2, 3]; array[0]', 1);
	});

	it('should interpret middle array element access', (): void => {
		assertValid('let array : [I32; 3; 3] = [1, 2, 3]; array[1]', 2);
	});

	it('should interpret last array element access', (): void => {
		assertValid('let array : [I32; 3; 3] = [1, 2, 3]; array[2]', 3);
	});

	it('should return Err for negative array index', (): void => {
		assertInterpretInvalid('let array : [I32; 3; 3] = [1, 2, 3]; array[-1]', 'out of bounds');
	});

	it('should return Err for out of bounds array index', (): void => {
		assertInterpretInvalid('let array : [I32; 3; 3] = [1, 2, 3]; array[3]', 'out of bounds');
	});

	it('should interpret array with typed elements U8', (): void => {
		assertValid('let array : [U8; 2; 2] = [100U8, 150U8]; array[0] + array[1]', 250);
	});

	it('should return Err for typed array element out of range', (): void => {
		assertInterpretInvalid('let array : [U8; 2; 2] = [100U8, 256U8]; array[1]', 'out of range');
	});

	it('should return Err for array initialization count mismatch', (): void => {
		assertInterpretInvalid(
			'let array : [I32; 3; 3] = [1, 2]; array[0]',
			'Array initialization count mismatch',
		);
	});

	it('should interpret array with expressions', (): void => {
		assertValid('let array : [I32; 3; 3] = [1 + 1, 2 + 2, 3 + 3]; array[0] + array[1]', 6);
	});

	it('should interpret array with computed elements in expression', (): void => {
		assertValid('let array : [I32; 2; 2] = [10, 20]; let index : I32 = 1; array[index]', 20);
	});
});

describe('interpret - arrays - sequential assignment', (): void => {
	it('should return Err for reading uninitialized element', (): void => {
		assertInterpretInvalid('let mut array : [I32; 0; 3]; array[0]', 'out of bounds');
	});

	it('should return Err for writing to uninitialized index out of order', (): void => {
		assertInterpretInvalid('let mut array : [I32; 0; 3]; array[2] = 100;', 'out of bounds');
	});

	it('should succeed when writing to next sequential uninitialized index', (): void => {
		assertValid('let mut array : [I32; 0; 3]; array[0] = 100; array[0]', 100);
	});

	it('should succeed when writing to indices in order', (): void => {
		assertValid(
			'let mut array : [I32; 0; 3]; array[0] = 100; array[1] = 200; array[0] + array[1]',
			300,
		);
	});

	it('should return Err when skipping index during sequential initialization', (): void => {
		assertInterpretInvalid(
			'let mut array : [I32; 0; 3]; array[0] = 100; array[2] = 300;',
			'out of bounds',
		);
	});

	it('should return Err when writing to arr[1] before arr[0]', (): void => {
		assertInterpretInvalid('let mut array : [I32; 0; 3]; array[1] = 200;', 'out of bounds');
	});
});
