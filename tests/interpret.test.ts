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

	test('compileAndExecute should call compile and execute and return the execute exit code', (): void => {
		const spyCompile = jest
			.spyOn(interp.runtime, 'compile')
			.mockImplementation((): string => 'TARGET');
		const spyExecute = jest.spyOn(interp.runtime, 'execute').mockImplementation((): number => 7);

		const exitCode = interp.compileAndExecute('SRC', 'STDIN');

		expect(spyCompile).toHaveBeenCalledWith('SRC');
		expect(spyExecute).toHaveBeenCalledWith('TARGET', 'STDIN');
		expect(exitCode).toBe(7);

		spyCompile.mockRestore();
		spyExecute.mockRestore();
	});
});
