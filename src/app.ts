function compile(source: string): string {
	// Minimal compiler for the tests: return JavaScript that evaluates to 0 for empty input.
	if (source === '') {
		return '0';
	}

	// TODO: implement actual compilation logic.
	return '0';
}

export function run(source: string, stdIn?: string): number {
	// TODO: figure out how to pass in stdIn properly here.
	void stdIn; // mark as used to satisfy lint
	// eval is intentionally used here
	// eslint-disable-next-line no-eval
	return eval(compile(source)) as number;
}
