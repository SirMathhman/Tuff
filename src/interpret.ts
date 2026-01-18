/**
 * Interpret the given source code with provided stdin.
 * This is a stub implementation that should return an exit code.
 *
 * @param source - source code to interpret
 * @param stdIn - input provided to the program
 * @returns exit code (number)
 */
export function interpret(source: string, stdIn: string): number {
	// Stub: not yet implemented
	void source;
	void stdIn;
	return 0;
}

/**
 * Compile the given source to a target string.
 *
 * @param source - source code to compile
 * @returns compiled target as a string
 */
export const compile = (source: string): string => {
	// Stub: not yet implemented
	void source;
	return '';
};

/**
 * Execute the given target string and return an exit code.
 *
 * @param target - compiled target to execute
 * @returns exit code (number)
 */
export const execute = (target: string): number => {
	// Stub: not yet implemented
	void target;
	return 0;
};

// Export runtime helpers as an object to enable mocking/spying in tests
export const runtime = {
	compile,
	execute,
};

/**
 * Compile source code and execute with provided stdin.
 * This uses `runtime.compile` and `runtime.execute` helpers so tests can
 * override/mock them.
 *
 * @param source - source code to compile and run
 * @param stdIn - input provided to the program (currently unused)
 * @returns exit code (number)
 */
export function compileAndExecute(source: string, stdIn: string): number {
	void stdIn;
	const target = runtime.compile(source);
	const exitCode = runtime.execute(target);
	return exitCode;
}
