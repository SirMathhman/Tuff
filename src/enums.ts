import { err, ok, type Result } from './common/result';
import {
	isVariableName,
	findClosingBrace,
	type ParsedBinding,
	type EnumValue,
	type EnumParseResult,
} from './common/types';

/**
 * Global registry of enum definitions.
 */
const enumRegistry: Map<string, string[]> = new Map();

/**
 * Registers an enum definition globally.
 */
export function registerEnumDefinition(name: string, members: string[]): void {
	enumRegistry.set(name, members);
}

/**
 * Gets enum members from registry.
 */
export function getEnumMembers(enumName: string): string[] | undefined {
	return enumRegistry.get(enumName);
}

/**
 * Checks if a type name is a registered enum type.
 */
export function isEnumType(typeName: string): boolean {
	return enumRegistry.has(typeName);
}

/**
 * Clears enum registry (for testing).
 */
export function clearEnumRegistry(): void {
	enumRegistry.clear();
}

/**
 * Checks if input looks like an enum definition.
 */
export function isEnumDefinition(input: string): boolean {
	const trimmed = input.trim();
	return trimmed.startsWith('enum ') && trimmed.includes('{');
}

/**
 * Parses an enum definition: enum MyEnum { First, Second, Third }
 */
export function parseEnumDefinition(input: string): Result<EnumParseResult> {
	const trimmed = input.trim();
	if (!trimmed.startsWith('enum')) {
		return err('Not an enum definition');
	}
	const afterEnum = trimmed.substring(4).trim();
	if (afterEnum.length === 0) {
		return err('Enum definition missing name');
	}
	let spaceIndex = afterEnum.indexOf(' ');
	const braceIndex = afterEnum.indexOf('{');
	if (spaceIndex < 0) {
		spaceIndex = braceIndex;
	} else if (braceIndex >= 0 && braceIndex < spaceIndex) {
		spaceIndex = braceIndex;
	}
	if (spaceIndex < 0) {
		return err('Enum definition malformed');
	}
	const enumName = afterEnum.substring(0, spaceIndex).trim();
	if (!isVariableName(enumName)) {
		return err(`Invalid enum name: ${enumName}`);
	}
	const afterName = afterEnum.substring(spaceIndex).trim();
	if (!afterName.startsWith('{')) {
		return err('Enum definition missing opening brace');
	}
	const closingBraceIndex = findClosingBrace(afterName);
	if (closingBraceIndex < 0) {
		return err('Enum definition missing closing brace');
	}
	const membersStr = afterName.substring(1, closingBraceIndex).trim();
	const members = membersStr
		.split(',')
		.map((m): string => m.trim())
		.filter((m): boolean => m.length > 0);
	if (members.length === 0) {
		return err('Enum must have at least one member');
	}
	for (const member of members) {
		if (!isVariableName(member)) {
			return err(`Invalid enum member name: ${member}`);
		}
	}
	const remaining = afterName.substring(closingBraceIndex + 1).trim();
	return ok({ name: enumName, members, remaining });
}

/**
 * Internal function to parse enum member access and return EnumValue.
 */
function parseEnumMemberAccessInternal(expr: string): EnumValue | undefined {
	const trimmed = expr.trim();
	const doubleColonIndex = trimmed.indexOf('::');
	if (doubleColonIndex < 0) {
		return undefined;
	}

	const enumType = trimmed.substring(0, doubleColonIndex).trim();
	const memberName = trimmed.substring(doubleColonIndex + 2).trim();

	if (!isVariableName(enumType) || !isVariableName(memberName)) {
		return undefined;
	}

	const members = getEnumMembers(enumType);
	if (members === undefined) {
		return undefined;
	}

	const memberIndex = members.indexOf(memberName);
	if (memberIndex < 0) {
		return undefined;
	}

	return {
		enumType,
		memberName,
		memberIndex,
	};
}

/**
 * Parses an enum member access for expressions: MyEnum::First
 * Returns the member index as a number.
 */
export function tryParseEnumMemberAccess(expr: string): Result<number> | undefined {
	const enumValue = parseEnumMemberAccessInternal(expr);
	if (enumValue === undefined) {
		return undefined;
	}

	return ok(enumValue.memberIndex);
}

/**
 * Handles enum type variable binding: let x : MyEnum = MyEnum::First;
 */
export function parseEnumTypeBinding(
	varName: string,
	isMutable: boolean,
	typeAnnotation: string,
	valueStr: string,
	remaining: string,
): Result<ParsedBinding> {
	const members = getEnumMembers(typeAnnotation);
	if (members === undefined) {
		return err(`Undefined enum type: ${typeAnnotation}`);
	}

	const enumValue = parseEnumMemberAccessInternal(valueStr);
	if (enumValue === undefined) {
		return err('Expected enum member access (EnumType::Member)');
	}

	if (enumValue.enumType !== typeAnnotation) {
		return err(`Enum type mismatch: expected ${typeAnnotation}, got ${enumValue.enumType}`);
	}

	return ok({
		name: varName,
		value: undefined,
		isMutable,
		remaining,
		enumValue,
	});
}
