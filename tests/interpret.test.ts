import * as interp from '../src/interpret';

function getInterpretValue(result: interp.Result<number, string>): number {
	if (result.ok) {
		return result.value;
	}
	return -1;
}

function testInterpretValid(source: string, stdIn: string, expectedExitCode: number): void {
	test(`interpret('${source}', '${stdIn}') should return ${expectedExitCode}`, (): void => {
		const result = interp.interpret(source, stdIn);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.value).toBe(expectedExitCode);
	});
}

function testCompileAndExecuteValid(source: string, stdIn: string, expectedExitCode: number): void {
	test(`compileAndExecute('${source}', '${stdIn}') should return ${expectedExitCode}`, (): void => {
		const result = interp.compileAndExecute(source, stdIn);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.value).toBe(expectedExitCode);
	});
}

function testBothValid(source: string, stdIn: string, expectedExitCode: number): void {
	testInterpretValid(source, stdIn, expectedExitCode);
	testCompileAndExecuteValid(source, stdIn, expectedExitCode);
}

function testInterpretInvalid(source: string, stdIn: string): void {
	test(`interpret('${source}', '${stdIn}') should return error`, (): void => {
		const result = interp.interpret(source, stdIn);
		expect(result.ok).toBe(false);
	});
}

function testCompileInvalid(source: string): void {
	test(`compile('${source}') should return error`, (): void => {
		const result = interp.compile(source);
		expect(result.ok).toBe(false);
	});
}

function testBothInvalid(source: string, stdIn: string = ''): void {
	testInterpretInvalid(source, stdIn);
	testCompileInvalid(source);
}

describe('interpret and compileAndExecute stubs', (): void => {
	test('interpret should be a function and return a Result', (): void => {
		expect(typeof interp.interpret).toBe('function');
		const result = interp.interpret('some source', 'some stdin');
		expect(result.ok).toBe(true);
		const value = getInterpretValue(result);
		expect(typeof value).toBe('number');
	});

	test('compileAndExecute should be a function and return a Result', (): void => {
		expect(typeof interp.compileAndExecute).toBe('function');
		const result = interp.compileAndExecute('some source', 'some stdin');
		expect(result.ok).toBe(true);
		const value = getInterpretValue(result);
		expect(typeof value).toBe('number');
	});

	testBothValid('100', '', 100);
	testBothValid('100U8', '', 100);
	testBothValid('read<U8>()', '100', 100);
	testBothValid('read<U8>() + 1', '100', 101);
	testBothValid('read<U8>() + read<U8>()', '1 2', 3);
	testBothValid('read<U8>() + read<U8>() + read<U8>()', '1 2 3', 6);
	testBothValid('read<U8>() + read<U8>() - read<U8>()', '2 3 4', 1);
	testBothValid('read<U8>() * read<U8>() - read<U8>()', '2 3 4', 2);
	testBothValid('read<U8>() + read<U8>() * read<U8>()', '2 3 4', 14);
	testBothValid('(read<U8>() + read<U8>()) * read<U8>()', '2 3 4', 20);
	testBothValid('{ read<U8>() }', '2', 2);
	testBothValid('{ read<U8>() + read<U8>() }', '2 3', 5);
	testBothValid('(read<U8>() + { read<U8>() }) * read<U8>()', '2 3 4', 20);
	testBothValid('(read<U8>() + { let x : U8 = read<U8>(); x }) * read<U8>()', '2 3 4', 20);
	testBothValid(
		'(read<U8>() + { let x : U8 = read<U8>(); let y : U8 = x; y }) * read<U8>()',
		'2 3 4',
		20,
	);
	testBothValid('let z : U8 = read<U8>(); z', '2', 2);
	testBothValid('let z : U8 = read<U8>();', '2', 0);
	testBothInvalid('let z : U8 = read<U16>();');
	testBothInvalid('let z : U8 = read<U8>() + read<U16>();');
});
