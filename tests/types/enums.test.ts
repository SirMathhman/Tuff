import { interpret } from '../../src/interpret';
import { clearEnumRegistry } from '../../src/types/enums';

describe('Enums - Definition and Access', (): void => {
	beforeEach((): void => {
		clearEnumRegistry();
	});
	test('should define and access simple enum', (): void => {
		const result = interpret('enum Color { Red, Green, Blue } let c : Color = Color::Red; c');
		expect(result).toEqual({ type: 'ok', value: 0 });
	});

	test('should access different enum members', (): void => {
		const result = interpret('enum Color { Red, Green, Blue } Color::Green');
		expect(result).toEqual({ type: 'ok', value: 1 });
	});

	test('should handle enum with single member', (): void => {
		const result = interpret('enum Status { Active } let s : Status = Status::Active; s');
		expect(result).toEqual({ type: 'ok', value: 0 });
	});

	test('should handle enum with many members', (): void => {
		const result = interpret('enum Day { Mon, Tue, Wed, Thu, Fri, Sat, Sun } Day::Fri');
		expect(result).toEqual({ type: 'ok', value: 4 });
	});

	test('should store enum in variable and retrieve', (): void => {
		const result = interpret(
			'enum Status { Pending, Active, Complete } let x : Status = Status::Active; x',
		);
		expect(result).toEqual({ type: 'ok', value: 1 });
	});
});

describe('Enums - Arithmetic Operations', (): void => {
	beforeEach((): void => {
		clearEnumRegistry();
	});
	test('should perform arithmetic on enum member indices', (): void => {
		const result = interpret('enum Num { A, B, C, D } Num::A + Num::D');
		expect(result).toEqual({ type: 'ok', value: 3 });
	});

	test('should use enum members in expressions', (): void => {
		const result = interpret('enum Num { A, B, C } let x : Num = Num::B; x * 2');
		expect(result).toEqual({ type: 'ok', value: 2 });
	});

	test('should compare enum members', (): void => {
		const result = interpret('enum Num { A, B, C } Num::A < Num::C');
		expect(result).toEqual({ type: 'ok', value: 1 });
	});
});

describe('Enums - Error Cases', (): void => {
	beforeEach((): void => {
		clearEnumRegistry();
	});
	test('should reject undefined enum member', (): void => {
		const result = interpret('enum Color { Red, Green } Color::Blue');
		expect(result.type).toBe('err');
	});

	test('should reject undefined enum type', (): void => {
		const result = interpret('let x : Color = Color::Red; x');
		expect(result.type).toBe('err');
	});

	test('should reject enum type mismatch', (): void => {
		const result = interpret('enum Color { Red } enum Size { Big } let x : Color = Size::Big; x');
		expect(result.type).toBe('err');
	});

	test('should reject duplicate enum definitions', (): void => {
		const result = interpret('enum X { A } enum X { B }');
		expect(result.type).toBe('err');
	});
});
