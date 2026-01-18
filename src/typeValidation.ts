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
 * Information extracted from a let-binding statement.
 */
interface ParsedLetStatement {
	name: string;
	declaredType: string;
	expr: string;
}

/**
 * Extract variable name, declared type and expression from a let-binding statement.
 *
 * @param stmt - the statement (e.g., "let x : U8 = 10")
 * @returns object with name, type and expr, or undefined if not a valid let-binding
 */
function parseLetStatement(stmt: string): ParsedLetStatement | undefined {
	const trimmed = stmt.trim();
	if (!trimmed.startsWith('let ')) {
		return undefined;
	}

	const afterLet = trimmed.substring(4).trim();
	const equalsIdx = afterLet.indexOf('=');
	if (equalsIdx === -1) {
		return undefined;
	}

	const beforeEquals = afterLet.substring(0, equalsIdx).trim();
	const expr = afterLet.substring(equalsIdx + 1).trim();

	const colonIdx = beforeEquals.indexOf(':');
	if (colonIdx === -1) {
		return { name: beforeEquals, declaredType: '', expr };
	}

	const name = beforeEquals.substring(0, colonIdx).trim();
	const declaredType = beforeEquals.substring(colonIdx + 1).trim();

	return { name, declaredType, expr };
}

/**
 * Get the effective type of an expression based on read calls and variables.
 *
 * @param expr - the expression string
 * @param variableTypes - map of already declared variables and their types
 * @returns the largest type found in the expression
 */
function getExpressionType(expr: string, variableTypes: Map<string, string>): string {
	const readTypes = getAllReadTypesInExpression(expr);
	let maxType = 'U8';
	let maxRank = getTypeRank(maxType);

	for (const rt of readTypes) {
		const rank = getTypeRank(rt);
		if (rank > maxRank) {
			maxRank = rank;
			maxType = rt;
		}
	}

	variableTypes.forEach((varType: string, varName: string): void => {
		const varRegex = new RegExp(`\\b${varName}\\b`);
		const hasVar = varRegex.test(expr);
		const rank = getTypeRank(varType);
		if (hasVar && rank > maxRank) {
			maxRank = rank;
			maxType = varType;
		}
	});

	return maxType;
}

/**
 * Validate type compatibility in a single let-binding statement.
 *
 * @param parsed - the parsed let-statement info
 * @param variableTypes - existing variables and their types
 * @returns error message if any, empty string otherwise
 */
function validateStatement(parsed: ParsedLetStatement, variableTypes: Map<string, string>): string {
	if (variableTypes.has(parsed.name)) {
		return `Variable '${parsed.name}' is already declared`;
	}

	const exprType = getExpressionType(parsed.expr, variableTypes);
	const declaredType = parsed.declaredType || exprType;

	if (parsed.declaredType && getTypeRank(parsed.declaredType) < getTypeRank(exprType)) {
		return `Type mismatch: declared type '${parsed.declaredType}' cannot hold expression of type '${exprType}'`;
	}

	variableTypes.set(parsed.name, declaredType);
	return '';
}

/**
 * Validate type compatibility in a let-binding declaration at source level.
 * Handles multiple statements and checks for duplicate declarations.
 *
 * @param source - the source code
 * @returns error message if any error found, empty string if valid
 */
export function validateTopLevelLetBinding(source: string): string {
	const statements = source
		.split(';')
		.map((s: string): string => s.trim())
		.filter((s: string): string => s);
	const variableTypes = new Map<string, string>();

	for (const stmt of statements) {
		const parsed = parseLetStatement(stmt);
		if (!parsed) {
			continue;
		}

		const error = validateStatement(parsed, variableTypes);
		if (error) {
			return error;
		}
	}

	return '';
}
