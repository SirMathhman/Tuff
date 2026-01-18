/**
 * Type validation utilities for the Tuff language interpreter.
 */

/**
 * Extract the type from a read<Type>() expression.
 *
 * @param expr - expression string
 * @returns the type string or empty string if not found
 */
export function extractReadTypeFromExpr(expr: string): string {
	if (!expr.includes('read<')) {
		return '';
	}
	const readStart = expr.indexOf('read<');
	const typeStart = readStart + 5;
	const typeEnd = expr.indexOf('>', typeStart);
	if (typeEnd === -1) {
		return '';
	}
	return expr.substring(typeStart, typeEnd).trim();
}

/**
 * Get all read types used in an expression.
 *
 * @param expr - expression string
 * @returns array of type strings found in read<Type>() calls
 */
function getAllReadTypesInExpression(expr: string): string[] {
	const types: string[] = [];
	if (!expr.includes('read<')) {
		return types;
	}

	let currentIdx = 0;

	while (currentIdx < expr.length) {
		const readStart = expr.indexOf('read<', currentIdx);
		if (readStart === -1) {
			break;
		}

		const typeStart = readStart + 5;
		const typeEnd = expr.indexOf('>', typeStart);
		if (typeEnd === -1) {
			break;
		}

		const readType = expr.substring(typeStart, typeEnd).trim();
		types.push(readType);
		currentIdx = typeEnd + 1;
	}

	return types;
}

/**
 * Get the size rank of a type (for determining type compatibility).
 *
 * @param type - type string
 * @returns size rank (higher = larger type)
 */
function getTypeRank(type: string): number {
	switch (type) {
		case 'U8':
			return 8;
		case 'U16':
			return 16;
		case 'U32':
			return 32;
		case 'U64':
			return 64;
		default:
			return 0;
	}
}

/**
 * Format a type mismatch error message.
 *
 * @param declaredType - the declared type
 * @param readType - the read type
 * @returns formatted error message
 */
function typeMismatchError(declaredType: string, readType: string): string {
	return `Type mismatch: declared type '${declaredType}' cannot hold read type '${readType}'`;
}

/**
 * Validate a single read type against the declared type.
 *
 * @param readType - the read type
 * @param declaredType - the declared type
 * @returns error message or empty string if valid
 */
function validateSingleReadType(readType: string, declaredType: string): string {
	if (readType === declaredType) {
		return '';
	}

	const readRank = getTypeRank(readType);
	const declaredRank = getTypeRank(declaredType);

	// Allow if declared type is larger or equal
	if (declaredRank < readRank) {
		return typeMismatchError(declaredType, readType);
	}

	return '';
}

/**
 * Check if expression contains read calls with mismatched types.
 *
 * @param expr - expression string
 * @param declaredType - the declared type for the variable
 * @returns error message if types are incompatible, empty string if valid
 */
export function validateReadTypesInExpression(expr: string, declaredType: string): string {
	if (!expr.includes('read<') || !declaredType) {
		return '';
	}

	const types = getAllReadTypesInExpression(expr);
	if (types.length === 0) {
		return '';
	}

	// If only one read type, verify it's compatible with declared type
	if (types.length === 1) {
		return validateSingleReadType(types[0], declaredType);
	}

	// Multiple read types - check if they can be mixed
	const declaredRank = getTypeRank(declaredType);
	for (const type of types) {
		const typeRank = getTypeRank(type);
		// Declared type must be at least as large as any read type
		if (declaredRank < typeRank) {
			return typeMismatchError(declaredType, type);
		}
	}

	return '';
}

/**
 * Information extracted from a let-binding.
 */
interface LetInfo {
	declaredType: string;
	expr: string;
}

/**
 * Extract declared type and expression from a let-binding source.
 *
 * @param trimmedSource - the trimmed source code
 * @returns object with declaredType and expr, or empty strings if not a valid let-binding
 */
function extractLetInfo(trimmedSource: string): LetInfo {
	const equalsIdx = trimmedSource.indexOf('=');
	if (equalsIdx === -1) {
		return { declaredType: '', expr: '' };
	}

	const colonIdx = trimmedSource.indexOf(':');
	if (colonIdx === -1 || colonIdx >= equalsIdx) {
		let expr = trimmedSource.substring(equalsIdx + 1).trim();
		if (expr.endsWith(';')) {
			expr = expr.substring(0, expr.length - 1).trim();
		}
		return { declaredType: '', expr };
	}

	const declaredPart = trimmedSource.substring(colonIdx + 1, equalsIdx);
	const declaredType = declaredPart.split(';')[0].trim();

	let expr = trimmedSource.substring(equalsIdx + 1);
	if (expr.endsWith(';')) {
		expr = expr.substring(0, expr.length - 1);
	}
	expr = expr.trim();

	return { declaredType, expr };
}

/**
 * Validate type compatibility in a let-binding declaration at source level.
 *
 * @param source - the source code
 * @returns error message if type mismatch, empty string if valid or not a let-binding
 */
export function validateTopLevelLetBinding(source: string): string {
	const trimmedSource = source.trim();
	if (!trimmedSource.startsWith('let ')) {
		return '';
	}

	const { declaredType, expr } = extractLetInfo(trimmedSource);
	if (!declaredType || !expr) {
		return '';
	}

	// Check for read type compatibility with declared type
	const typeError = validateReadTypesInExpression(expr, declaredType);
	return typeError || '';
}
