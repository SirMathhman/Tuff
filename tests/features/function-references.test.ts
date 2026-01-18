import { clearFunctionRegistry } from '../../src/interpreter/functions';
import {
	assertCompileValid,
	assertInterpretAndCompileValid,
	assertInterpretAndCompileInvalid,
} from '../../src/testing/test-helpers';

describe('function references (interpret + compile)', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('basic: no params', (): void => {
		assertInterpretAndCompileValid(
			'fn get() : I32 => 100; let myGet : () => I32 = get; myGet()',
			100,
		);
	});

	it('with parameters', (): void => {
		assertInterpretAndCompileValid(
			'fn add(a : I32, b : I32) : I32 => a + b; let f : (I32, I32) => I32 = add; f(2, 3)',
			5,
		);
	});

	it('U8 return type', (): void => {
		assertInterpretAndCompileValid('fn get() : U8 => 50U8; let ref : () => U8 = get; ref()', 50);
	});

	it('mixed parameter types', (): void => {
		assertInterpretAndCompileValid(
			'fn add(a : U8, b : I32) : I32 => a + b; let f : (U8, I32) => I32 = add; f(10U8, 20)',
			30,
		);
	});

	it('multiple references', (): void => {
		assertInterpretAndCompileValid(
			'fn one() : I32 => 1; fn two() : I32 => 2; let f1 : () => I32 = one; let f2 : () => I32 = two; f1() + f2()',
			3,
		);
	});
});

describe('function references (errors: interpret + compile)', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('undefined function error', (): void => {
		assertInterpretAndCompileInvalid('let r : () => I32 = undef; r()', 'not defined');
	});

	it('wrong arg count error', (): void => {
		assertInterpretAndCompileInvalid(
			'fn add(a : I32, b : I32) : I32 => a + b; let f : (I32, I32) => I32 = add; f(5)',
			'expects 2 argument(s)',
		);
	});
});

describe('function references (compiler runtime via read<T>())', (): void => {
	it('passes read<I32>() through a referenced function', (): void => {
		assertCompileValid(
			'fn id(x : I32) : I32 => x; let f : (I32) => I32 = id; f(read<I32>())',
			'42',
			42,
		);
	});

	it('uses read<I32>() as an argument to referenced function', (): void => {
		assertCompileValid(
			'fn add(a : I32, b : I32) : I32 => a + b; let f : (I32, I32) => I32 = add; let x : I32 = read<I32>(); f(x, 3)',
			'7',
			10,
		);
	});

	it('supports U8 reads in referenced function calls', (): void => {
		assertCompileValid(
			'fn add(a : U8, b : U8) : I32 => a + b; let f : (U8, U8) => I32 = add; f(read<U8>(), read<U8>())',
			'20 30',
			50,
		);
	});
});
