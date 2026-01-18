import { interpret, compileAndExecute } from '../src/interpret';

describe('interpret and compileAndExecute stubs', (): void => {
	test('interpret should be a function and return a number', (): void => {
		expect(typeof interpret).toBe('function');
		const exitCode = interpret('some source', 'some stdin');
		expect(typeof exitCode).toBe('number');
	});

	test('compileAndExecute should be a function and return a number', (): void => {
		expect(typeof compileAndExecute).toBe('function');
		const exitCode = compileAndExecute('some source', 'some stdin');
		expect(typeof exitCode).toBe('number');
	});
});
