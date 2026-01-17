import {
	assertInterpretAndCompileValid,
	assertInterpretAndCompileInvalid,
} from '../../src/testing/test-helpers';

function testBasicLiterals(): void {
	it('should interpret "100" as 100', (): void => {
		assertInterpretAndCompileValid('100', 100);
	});
	it('should interpret "100U8" as 100', (): void => {
		assertInterpretAndCompileValid('100U8', 100);
	});
	it('should return Err for "-100U8"', (): void => {
		assertInterpretAndCompileInvalid('-100U8', 'Negative');
	});
	it('should return Err for "256U8"', (): void => {
		assertInterpretAndCompileInvalid('256U8', 'out of range');
	});
}

function testBasicArithmetic(): void {
	it('should interpret "1U8 + 2U8" as 3', (): void => {
		assertInterpretAndCompileValid('1U8 + 2U8', 3);
	});
	it('should interpret "1 + 2U8" as 3', (): void => {
		assertInterpretAndCompileValid('1 + 2U8', 3);
	});
	it('should interpret "1U8 + 2" as 3', (): void => {
		assertInterpretAndCompileValid('1U8 + 2', 3);
	});
	it('should return Err for "1U8 + 255"', (): void => {
		assertInterpretAndCompileInvalid('1U8 + 255', 'out of range');
	});
	it('should interpret "1U8 + 2U16" as 3', (): void => {
		assertInterpretAndCompileValid('1U8 + 2U16', 3);
	});
	it('should return Err for "1U8 + 65535U16"', (): void => {
		assertInterpretAndCompileInvalid('1U8 + 65535U16', 'out of range');
	});
	it('should interpret "1U8 + 255U16" as 256', (): void => {
		assertInterpretAndCompileValid('1U8 + 255U16', 256);
	});
	it('should interpret "255U16 + 1U8" as 256', (): void => {
		assertInterpretAndCompileValid('255U16 + 1U8', 256);
	});
	it('should interpret "1 + 2 + 3" as 6', (): void => {
		assertInterpretAndCompileValid('1 + 2 + 3', 6);
	});
	it('should return Err for "254 + 1U8 + 1"', (): void => {
		assertInterpretAndCompileInvalid('254 + 1U8 + 1', 'out of range');
	});
	it('should return Err for "1U8 - 2"', (): void => {
		assertInterpretAndCompileInvalid('1U8 - 2', 'out of range');
	});
	it('should interpret "1I8 - 2" as -1', (): void => {
		assertInterpretAndCompileValid('1I8 - 2', -1);
	});
	it('should interpret "2 + 3 - 4" as 1', (): void => {
		assertInterpretAndCompileValid('2 + 3 - 4', 1);
	});
	it('should interpret "2 * 3 - 4" as 2', (): void => {
		assertInterpretAndCompileValid('2 * 3 - 4', 2);
	});
	it('should interpret "4 + 2 * 3" as 10', (): void => {
		assertInterpretAndCompileValid('4 + 2 * 3', 10);
	});
}

function testParenthesesAndDivision(): void {
	it('should interpret "(4)" as 4', (): void => {
		assertInterpretAndCompileValid('(4)', 4);
	});
	it('should interpret "(4 + 2) * 3" as 18', (): void => {
		assertInterpretAndCompileValid('(4 + 2) * 3', 18);
	});
	it('should interpret "1 + (4 + 2) * 3" as 19', (): void => {
		assertInterpretAndCompileValid('1 + (4 + 2) * 3', 19);
	});
	it('should return Err for "10 / (2 - 2)"', (): void => {
		assertInterpretAndCompileInvalid('10 / (2 - 2)', 'Division by zero');
	});
}

function testBlocks(): void {
	it('should interpret "{ 7 }" as 7', (): void => {
		assertInterpretAndCompileValid('{ 7 }', 7);
	});
	it('should interpret "10 / ({ 7 } - 2)" as 2', (): void => {
		assertInterpretAndCompileValid('10 / ({ 7 } - 2)', 2);
	});
	it('should interpret "{ 2 } * 3 + 1" as 7', (): void => {
		assertInterpretAndCompileValid('{ 2 } * 3 + 1', 7);
	});
	it('should interpret "1 + { 4 + 2 } * 3" as 19', (): void => {
		assertInterpretAndCompileValid('1 + { 4 + 2 } * 3', 19);
	});
}

describe('literals and arithmetic', (): void => {
	testBasicLiterals();
	testBasicArithmetic();
	testParenthesesAndDivision();
	testBlocks();
});
