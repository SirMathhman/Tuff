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
 * Check if expression contains read calls with mismatched types.
 *
 * @param expr - expression string
 * @returns error message if types mismatch, empty string if all types match or no reads
 */
export function validateReadTypesInExpression(expr: string): string {
	if (!expr.includes('read<')) {
		return '';
	}

	let currentIdx = 0;
	let firstReadType: string | undefined;

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
		if (firstReadType === undefined) {
			firstReadType = readType;
		} else if (readType !== firstReadType) {
			return `Type mismatch in expression: '${firstReadType}' and '${readType}' cannot be mixed`;
		}

		currentIdx = typeEnd + 1;
	}

	return '';
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

	const equalsIdx = trimmedSource.indexOf('=');
	if (equalsIdx === -1) {
		return '';
	}

	const colonIdx = trimmedSource.indexOf(':');
	if (colonIdx === -1 || colonIdx >= equalsIdx) {
		return '';
	}

	const declaredPart = trimmedSource.substring(colonIdx + 1, equalsIdx);
	const declaredType = declaredPart.split(';')[0].trim();

	let expr = trimmedSource.substring(equalsIdx + 1);
	if (expr.endsWith(';')) {
		expr = expr.substring(0, expr.length - 1);
	}
	expr = expr.trim();

	// Check for mixed read types in expression
	const mixedTypeError = validateReadTypesInExpression(expr);
	if (mixedTypeError) {
		return mixedTypeError;
	}

	const readType = extractReadTypeFromExpr(expr);
	if (readType && declaredType !== readType) {
		return `Type mismatch: declared type '${declaredType}' does not match read type '${readType}'`;
	}

	return '';
}
