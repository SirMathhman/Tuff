import { assertValid } from '../src/testing/test-helpers';

describe('interpret - booleans', (): void => {
	it('should interpret "let x : Bool = true; x" as 1', (): void => {
		assertValid('let x : Bool = true; x', 1);
	});

	it('should interpret "let x : Bool = true; let y : Bool = false; x || y" as 1', (): void => {
		assertValid('let x : Bool = true; let y : Bool = false; x || y', 1);
	});

	it('should interpret "let x : Bool = true; let y : Bool = false; x && y" as 0', (): void => {
		assertValid('let x : Bool = true; let y : Bool = false; x && y', 0);
	});
});

describe('interpret - if expressions', (): void => {
	it('should interpret "if (true) 100 else 200" as 100', (): void => {
		assertValid('if (true) 100 else 200', 100);
	});

	it('should interpret "if (false) 100 else 200" as 200', (): void => {
		assertValid('if (false) 100 else 200', 200);
	});

	it('should interpret "let x = if (true) 100 else 200; x" as 100', (): void => {
		assertValid('let x = if (true) 100 else 200; x', 100);
	});

	it('should interpret "let x = if (false) 100 else 200; x" as 200', (): void => {
		assertValid('let x = if (false) 100 else 200; x', 200);
	});

	it('should interpret "if (1) 42 else 0" as 42', (): void => {
		assertValid('if (1) 42 else 0', 42);
	});

	it('should interpret "if (0) 42 else 0" as 0', (): void => {
		assertValid('if (0) 42 else 0', 0);
	});

	it('should interpret "if (1 + 2) 100 else 50" as 100', (): void => {
		assertValid('if (1 + 2) 100 else 50', 100);
	});

	it('should interpret nested if-else: "if (true) if (false) 1 else 2 else 3" as 2', (): void => {
		assertValid('if (true) if (false) 1 else 2 else 3', 2);
	});
});

describe('interpret - if statements with assignments', (): void => {
	it('should interpret "let x : I32; if (true) x = 100; else x = 200; x" as 100', (): void => {
		assertValid('let x : I32; if (true) x = 100; else x = 200; x', 100);
	});

	it('should interpret "let x : I32; if (false) x = 100; else x = 200; x" as 200', (): void => {
		assertValid('let x : I32; if (false) x = 100; else x = 200; x', 200);
	});

	it('should interpret "let x : I32; if (true) { x = 100; } else { x = 200; } x" as 100', (): void => {
		assertValid('let x : I32; if (true) { x = 100; } else { x = 200; } x', 100);
	});

	it('should interpret "let x : I32; if (false) { x = 100; } else { x = 200; } x" as 200', (): void => {
		assertValid('let x : I32; if (false) { x = 100; } else { x = 200; } x', 200);
	});

	it('should interpret "let mut x = 0; if (true) x = 100; x" as 100', (): void => {
		assertValid('let mut x = 0; if (true) x = 100; x', 100);
	});

	it('should interpret "let mut x = 0; if (false) x = 100; x" as 0', (): void => {
		assertValid('let mut x = 0; if (false) x = 100; x', 0);
	});
});

describe('interpret - chained if-else', (): void => {
	it('should interpret "let x = if (false) 100 else if (true) 200 else 300; x" as 200', (): void => {
		assertValid('let x = if (false) 100 else if (true) 200 else 300; x', 200);
	});

	it('should interpret "if (false) 100 else if (false) 200 else 300" as 300', (): void => {
		assertValid('if (false) 100 else if (false) 200 else 300', 300);
	});

	it('should interpret "if (true) 100 else if (true) 200 else 300" as 100', (): void => {
		assertValid('if (true) 100 else if (true) 200 else 300', 100);
	});

	it('should interpret "let x : I32; if (false) x = 100; else x = 200; x" as 200', (): void => {
		assertValid('let x : I32; if (false) x = 100; else x = 200; x', 200);
	});
});
