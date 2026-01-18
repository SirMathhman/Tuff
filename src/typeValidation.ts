/**
 * Type validation utilities for the Tuff language interpreter.
 */

/**
 * Split source into statements, being aware of braces.
 *
 * @param source - the source code
 * @returns array of statements
 */
export function splitStatements(source: string): string[] {
	const statements: string[] = [];
	let current = '';
	let braceDepth = 0;

	for (let i = 0; i < source.length; i++) {
		const char = source[i];
		if (char === '{') {
			braceDepth++;
			current += char;
		} else if (char === '}') {
			braceDepth--;
			current += char;
		} else if (char === ';' && braceDepth === 0) {
			statements.push(current.trim());
			current = '';
		} else {
			current += char;
		}
	}

	if (current.trim()) {
		statements.push(current.trim());
	}

	return statements.filter((s): boolean => Boolean(s));
}

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
		case 'Bool':
			return 1;
		case 'I8':
		case 'U8':
			return 8;
		case 'I16':
		case 'U16':
			return 16;
		case 'I32':
		case 'U32':
			return 32;
		case 'I64':
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
	isMutable: boolean;
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

	let afterLet = trimmed.substring(4).trim();
	let isMutable = false;
	if (afterLet.startsWith('mut ')) {
		isMutable = true;
		afterLet = afterLet.substring(4).trim();
	}

	const equalsIdx = afterLet.indexOf('=');
	if (equalsIdx === -1) {
		return undefined;
	}

	const beforeEquals = afterLet.substring(0, equalsIdx).trim();
	const expr = afterLet.substring(equalsIdx + 1).trim();

	const colonIdx = beforeEquals.indexOf(':');
	if (colonIdx === -1) {
		return { name: beforeEquals, declaredType: '', expr, isMutable };
	}

	const name = beforeEquals.substring(0, colonIdx).trim();
	const declaredType = beforeEquals.substring(colonIdx + 1).trim();

	return { name, declaredType, expr, isMutable };
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
	let maxType = '';
	let maxRank = -1;

	// Check for boolean literals or logical operators which suggest Bool type
	if (
		new RegExp('\\b(true|false)\\b').test(expr) ||
		expr.includes('!') ||
		expr.includes('||') ||
		expr.includes('&&')
	) {
		maxRank = 1;
		maxType = 'Bool';
	}

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
 * Variable information for type tracking.
 */
interface VariableInfo {
	type: string;
	isMutable: boolean;
}

/**
 * Validate type compatibility in a single let-binding statement.
 *
 * @param parsed - the parsed let-statement info
 * @param variableTypes - existing variables and their types
 * @returns error message if any, empty string otherwise
 */
function validateStatement(
	parsed: ParsedLetStatement,
	variableTypes: Map<string, VariableInfo>,
): string {
	if (variableTypes.has(parsed.name)) {
		return `Variable '${parsed.name}' is already declared`;
	}

	const variableTypesOnly = new Map<string, string>();
	variableTypes.forEach((info: VariableInfo, name: string): void => {
		variableTypesOnly.set(name, info.type);
	});

	const exprType = getExpressionType(parsed.expr, variableTypesOnly);
	// If it's a literal or doesn't have a clear type, default to I32 for mutable, or the declared type
	let defaultType = 'U8';
	if (parsed.isMutable) {
		defaultType = 'I32';
	}
	const declaredType = parsed.declaredType || exprType || defaultType;

	if (parsed.declaredType && exprType && getTypeRank(parsed.declaredType) < getTypeRank(exprType)) {
		return `Type mismatch: declared type '${parsed.declaredType}' cannot hold expression of type '${exprType}'`;
	}

	variableTypes.set(parsed.name, { type: declaredType, isMutable: parsed.isMutable });
	return '';
}

/**
 * Validate a reassignment statement.
 *
 * @param stmt - the statement string
 * @param variableTypes - existing variables
 * @returns error message if any, empty string otherwise
 */
function validateReassignment(stmt: string, variableTypes: Map<string, VariableInfo>): string {
	const trimmed = stmt.trim();
	// Regex to match a simple variable assignment: varName = expression
	// Should not match if it contains braces or complex syntax
	if (!new RegExp('^[a-zA-Z_][a-zA-Z0-9_]*\\s*=').test(trimmed)) {
		return '';
	}

	const equalsIdx = trimmed.indexOf('=');
	const varName = trimmed.substring(0, equalsIdx).trim();
	const expr = trimmed.substring(equalsIdx + 1).trim();

	const info = variableTypes.get(varName);
	if (!info) {
		// If it's not a declared variable, it might just be an expression containing '=' (like in a block)
		// but since we already check if it's at the start of the "statement", we should be careful.
		return '';
	}

	if (!info.isMutable) {
		return `Variable '${varName}' is immutable and cannot be reassigned`;
	}

	const variableTypesOnly = new Map<string, string>();
	variableTypes.forEach((vInfo: VariableInfo, name: string): void => {
		variableTypesOnly.set(name, vInfo.type);
	});

	const exprType = getExpressionType(expr, variableTypesOnly);
	if (exprType && getTypeRank(info.type) < getTypeRank(exprType)) {
		return `Type mismatch: cannot assign expression of type '${exprType}' to variable '${varName}' of type '${info.type}'`;
	}

	return '';
}

/**
 * Process a single statement in the top-level let-binding validation.
 *
 * @param stmt - statement string
 * @param variableTypes - map of variable types
 * @returns error message or empty string
 */
function processBindingStatement(stmt: string, variableTypes: Map<string, VariableInfo>): string {
	const parsed = parseLetStatement(stmt);
	if (parsed) {
		return validateStatement(parsed, variableTypes);
	}

	return validateReassignment(stmt, variableTypes);
}

/**
 * Validate type compatibility in a let-binding declaration at source level.
 * Handles multiple statements and checks for duplicate declarations.
 *
 * @param source - the source code
 * @returns error message if any error found, empty string if valid
 */
export function validateTopLevelLetBinding(source: string): string {
	const statements = splitStatements(source);
	const variableTypes = new Map<string, VariableInfo>();

	for (const stmt of statements) {
		const error = processBindingStatement(stmt, variableTypes);
		if (error) {
			return error;
		}
	}

	return '';
}
