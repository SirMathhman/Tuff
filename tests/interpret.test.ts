import * as interp from '../src/interpret';

describe('interpret and compileAndExecute stubs', (): void => {
	test('interpret should be a function and return a number', (): void => {
		expect(typeof interp.interpret).toBe('function');
		const exitCode = interp.interpret('some source', 'some stdin');
		expect(typeof exitCode).toBe('number');
	});

	test('compileAndExecute should be a function and return a number', (): void => {
		expect(typeof interp.compileAndExecute).toBe('function');
		const exitCode = interp.compileAndExecute('some source', 'some stdin');
		expect(typeof exitCode).toBe('number');
	});

	function testBoth(source: string, stdIn: string, expectedExitCode: number): void {
		// test interpret
		test(`interpret('${source}', '${stdIn}') should return ${expectedExitCode}`, (): void => {
			const exitCode = interp.interpret(source, stdIn);
			expect(exitCode).toBe(expectedExitCode);
		});

		// test compileAndExecute
		test(`compileAndExecute('${source}', '${stdIn}') should return ${expectedExitCode}`, (): void => {
			const exitCode = interp.compileAndExecute(source, stdIn);
			expect(exitCode).toBe(expectedExitCode);
		});
	}

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
});
