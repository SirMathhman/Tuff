import { clearStructRegistry } from '../../src/types/structs';
import {
	assertCompileValid,
	assertInterpretAndCompileValid,
	assertInterpretInvalid,
} from '../../src/testing/test-helpers';

describe('struct definitions and field access', (): void => {
	beforeEach((): void => {
		clearStructRegistry();
	});

	it('should interpret "struct Empty {}" as 0', (): void => {
		assertInterpretAndCompileValid('struct Empty {}', 0);
	});

	it('should interpret "struct Empty {} struct Empty0 {}" as 0', (): void => {
		assertInterpretAndCompileValid('struct Empty {} struct Empty0 {}', 0);
	});

	it('should interpret "{ struct Empty {} } struct Empty {}" as 0', (): void => {
		assertInterpretAndCompileValid('{ struct Empty {} } struct Empty {}', 0);
	});

	it('should return Err for duplicate struct definitions', (): void => {
		assertInterpretInvalid('struct Empty {} struct Empty {}', 'already defined');
	});

	it('should return Err for duplicate struct fields', (): void => {
		assertInterpretInvalid('struct Example { x : I32, x : I32 }', 'already defined');
	});

	it('should interpret "struct Wrapper { field : I32 }" as 0', (): void => {
		assertInterpretAndCompileValid('struct Wrapper { field : I32 }', 0);
	});
});

describe('struct instantiation', (): void => {
	beforeEach((): void => {
		clearStructRegistry();
	});

	it('should access single field', (): void => {
		assertInterpretAndCompileValid(
			'struct Wrapper { field : I32 } Wrapper { field : 100 }.field',
			100,
		);
	});

	it('should access x field from Point', (): void => {
		assertInterpretAndCompileValid(
			'struct Point { x : I32, y : I32 } Point { x : 10, y : 20 }.x',
			10,
		);
	});

	it('should access y field from Point', (): void => {
		assertInterpretAndCompileValid(
			'struct Point { x : I32, y : I32 } Point { x : 10, y : 20 }.y',
			20,
		);
	});

	it('should use struct field in expression', (): void => {
		assertInterpretAndCompileValid('struct S { val : I32 } S { val : 42 }.val + 8', 50);
	});

	it('should return Err for accessing undefined field', (): void => {
		assertInterpretInvalid('struct Point { x : I32 } Point { x : 5 }.y', 'not found');
	});
});

describe('struct variables', (): void => {
	beforeEach((): void => {
		clearStructRegistry();
	});

	it('should access field from struct variable with type annotation', (): void => {
		assertInterpretAndCompileValid(
			'struct Wrapper { field : I32 } let myWrapper : Wrapper = Wrapper { field : 100 }; myWrapper.field',
			100,
		);
	});

	it('should interpret struct variable with multiple fields', (): void => {
		assertInterpretAndCompileValid(
			'struct Point { x : I32, y : I32 } let p : Point = Point { x : 5, y : 12 }; p.x + p.y',
			17,
		);
	});

	it('should access field from struct variable without type annotation', (): void => {
		assertInterpretAndCompileValid(
			'struct Wrapper { field : I32 } let myWrapper = Wrapper { field : 100 }; myWrapper.field',
			100,
		);
	});

	it('should interpret struct reassignments', (): void => {
		assertInterpretAndCompileValid(
			'struct S { v : I32 } let mut s = S { v : 10 }; s = S { v : 20 }; s.v',
			20,
		);
	});

	it('should interpret struct variable in expressions', (): void => {
		assertInterpretAndCompileValid('struct S { val : I32 } let s : S = S { val : 8 }; s.val * 3', 24);
	});
});

describe('struct validation', (): void => {
	beforeEach((): void => {
		clearStructRegistry();
	});

	it('should return Err for unknown field in struct instantiation', (): void => {
		assertInterpretInvalid(
			'struct Wrapper { field : I32 } let myWrapper = Wrapper { nothing : 100 }; myWrapper.field',
			"Struct field 'nothing' not found in Wrapper",
		);
	});

	it('should return Err for unknown field in direct struct instantiation', (): void => {
		assertInterpretInvalid(
			'struct Wrapper { field : I32 } Wrapper { nothing : 100 }.field',
			"Struct field 'nothing' not found in Wrapper",
		);
	});

	it('should return Err for duplicate fields in struct instantiation', (): void => {
		assertInterpretInvalid(
			'struct Point { x : I32, y : I32 } Point { x : 1, x : 2, y : 3 }.x',
			"Duplicate field 'x' in instantiation",
		);
	});

	it('should return Err for missing field in struct instantiation', (): void => {
		assertInterpretInvalid(
			'struct Point { x : I32, y : I32 } let p = Point { x : 1 }; p.y',
			"Field 'y' not initialized in Point",
		);
	});
});

describe('struct - compiler read<T>() tests', (): void => {
	beforeEach((): void => {
		clearStructRegistry();
	});

	it('struct with runtime field value', (): void => {
		assertCompileValid(
			'struct Point { x : I32, y : I32 } Point { x : read<I32>(), y : 5 }.x',
			'10',
			10,
		);
	});

	it('struct variable with runtime field', (): void => {
		assertCompileValid('struct S { val : I32 } let s = S { val : read<I32>() }; s.val * 2', '21', 42);
	});
});
