import * as interp from '../src/interpret';

function getInterpretValue(result: interp.Result<number, string>): number {
	if (result.ok) {
		return result.value;
	}
	return -1;
}

function testInterpretValue(source: string, stdIn: string, expectedExitCode: number): void {
	test(`interpret('${source}', '${stdIn}') should return ${expectedExitCode}`, (): void => {
		const result = interp.interpret(source, stdIn);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.value).toBe(expectedExitCode);
	});
}

function testCompileAndExecuteValue(source: string, stdIn: string, expectedExitCode: number): void {
	test(`compileAndExecute('${source}', '${stdIn}') should return ${expectedExitCode}`, (): void => {
		const result = interp.compileAndExecute(source, stdIn);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.value).toBe(expectedExitCode);
	});
}

function testBoth(source: string, stdIn: string, expectedExitCode: number): void {
	testInterpretValue(source, stdIn, expectedExitCode);
	testCompileAndExecuteValue(source, stdIn, expectedExitCode);
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

	testBoth('100', '', 100);
	testBoth('100U8', '', 100);
	testBoth('read<U8>()', '100', 100);
	testBoth('read<U8>() + 1', '100', 101);
	testBoth('read<U8>() + read<U8>()', '1 2', 3);
	testBoth('read<U8>() + read<U8>() + read<U8>()', '1 2 3', 6);
	testBoth('read<U8>() + read<U8>() - read<U8>()', '2 3 4', 1);
	testBoth('read<U8>() * read<U8>() - read<U8>()', '2 3 4', 2);
	testBoth('read<U8>() + read<U8>() * read<U8>()', '2 3 4', 14);
	testBoth('(read<U8>() + read<U8>()) * read<U8>()', '2 3 4', 20);
	testBoth('{ read<U8>() }', '2', 2);
	testBoth('{ read<U8>() + read<U8>() }', '2 3', 5);
	testBoth('(read<U8>() + { read<U8>() }) * read<U8>()', '2 3 4', 20);
	testBoth('(read<U8>() + { let x : U8 = read<U8>(); x }) * read<U8>()', '2 3 4', 20);
	testBoth(
		'(read<U8>() + { let x : U8 = read<U8>(); let y : U8 = x; y }) * read<U8>()',
		'2 3 4',
		20,
	);
});
