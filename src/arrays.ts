import { err, ok, type Result } from './common/result';
import {
	type ArrayType,
	type ArrayValue,
	type ExecutionContext,
	validateValueForType,
	type ParsedBinding,
	isVariableName,
} from './common/types';
import { interpretInternal } from './evaluator';

/**
 * Represents extracted array indexing components.
 */
interface ArrayIndexingExtraction {
	arrayExpr: string;
	indexExpr: string;
}

/**
 * Parses an array type annotation like [I32; 3; 5].
 */
export function parseArrayType(typeStr: string): Result<ArrayType> {
	const trimmed = typeStr.trim();
	if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
		return err('Invalid array type');
	}

	const inner = trimmed.substring(1, trimmed.length - 1).trim();
	const parts = inner.split(';').map((p): string => p.trim());

	if (parts.length !== 3) {
		return err('Array type must have format [ElementType; InitCount; TotalCount]');
	}

	const elementType = parts[0];
	const initCountStr = parts[1];
	const totalCountStr = parts[2];

	if (elementType.length === 0) {
		return err('Array element type cannot be empty');
	}

	const initCount = Number.parseInt(initCountStr, 10);
	const totalCount = Number.parseInt(totalCountStr, 10);

	if (Number.isNaN(initCount) || Number.isNaN(totalCount)) {
		return err('Array counts must be valid integers');
	}

	if (initCount < 0 || totalCount < 0) {
		return err('Array counts must be non-negative');
	}

	if (initCount > totalCount) {
		return err('Initialized count cannot exceed total capacity');
	}

	return ok({ elementType, initializedCount: initCount, totalCapacity: totalCount });
}

/**
 * Checks if a string looks like an array literal [1, 2, 3].
 */
export function looksLikeArrayLiteral(expr: string): boolean {
	const trimmed = expr.trim();
	if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
		return false;
	}

	// Check if it's an array type annotation instead of a literal
	const inner = trimmed.substring(1, trimmed.length - 1);
	if (inner.includes(';')) {
		return false;
	}

	return true;
}

/**
 * Parses and evaluates an array literal [1, 2, 3].
 */
export function parseArrayLiteral(expr: string, context: ExecutionContext): Result<ArrayValue> {
	const trimmed = expr.trim();
	if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
		return err('Invalid array literal');
	}

	const inner = trimmed.substring(1, trimmed.length - 1).trim();
	if (inner.length === 0) {
		// Empty array
		return ok({
			elementType: 'I32',
			elements: [],
			initializedCount: 0,
			totalCapacity: 0,
		});
	}

	const elements: number[] = [];
	const parts = inner.split(',');

	for (const part of parts) {
		const trimmedPart = part.trim();
		if (trimmedPart.length === 0) {
			return err('Array literal contains empty element');
		}

		const result = interpretInternal(trimmedPart, context);
		if (result.type === 'err') {
			return result;
		}

		elements.push(result.value);
	}

	return ok({
		elementType: 'I32',
		elements,
		initializedCount: elements.length,
		totalCapacity: elements.length,
	});
}

/**
 * Validates that array initialization matches the type definition.
 */
export function validateArrayInitialization(
	arrayLiteral: ArrayValue,
	arrayType: ArrayType,
): Result<void> {
	if (arrayLiteral.initializedCount !== arrayType.initializedCount) {
		return err(
			`Array initialization count mismatch: expected ${arrayType.initializedCount}, got ${arrayLiteral.initializedCount}`,
		);
	}

	if (arrayType.initializedCount !== arrayType.totalCapacity) {
		return err('Currently, all allocated array elements must be initialized');
	}

	for (const element of arrayLiteral.elements) {
		const validation = validateValueForType(element, arrayType.elementType);
		if (validation.type === 'err') {
			return validation;
		}
	}

	return ok(undefined as void);
}

/**
 * Handles array type variable binding.
 */
export function parseArrayTypeBinding(
	varName: string,
	isMutable: boolean,
	typeAnnotation: string,
	valueStr: string,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> {
	const typeResult = parseArrayType(typeAnnotation);
	if (typeResult.type === 'err') {
		return typeResult;
	}

	const arrayType = typeResult.value;

	if (!looksLikeArrayLiteral(valueStr)) {
		return err('Expected array literal for array variable');
	}

	const literalResult = parseArrayLiteral(valueStr, context);
	if (literalResult.type === 'err') {
		return literalResult;
	}

	const arrayLiteral = literalResult.value;
	const validationResult = validateArrayInitialization(arrayLiteral, arrayType);
	if (validationResult.type === 'err') {
		return validationResult;
	}

	return ok({
		name: varName,
		value: undefined,
		isMutable,
		remaining,
		arrayValue: arrayLiteral,
	});
}

/**
 * Checks if input looks like array indexing (var[index]).
 */
export function looksLikeArrayIndexing(expr: string): boolean {
	const trimmed = expr.trim();
	const bracketIndex = trimmed.lastIndexOf('[');
	if (bracketIndex <= 0) {
		return false;
	}

	const beforeBracket = trimmed.substring(0, bracketIndex).trim();
	if (beforeBracket.includes('}')) {
		return true;
	}

	return isVariableName(beforeBracket);
}

/**
 * Extracts array name and index from array[index] expression.
 */
function extractArrayIndexing(expr: string): ArrayIndexingExtraction | undefined {
	const trimmed = expr.trim();
	const bracketIndex = trimmed.lastIndexOf('[');
	if (bracketIndex <= 0 || !trimmed.endsWith(']')) {
		return undefined;
	}

	const arrayExpr = trimmed.substring(0, bracketIndex).trim();
	const indexExpr = trimmed.substring(bracketIndex + 1, trimmed.length - 1).trim();

	if (arrayExpr.length === 0 || indexExpr.length === 0) {
		return undefined;
	}

	return { arrayExpr, indexExpr };
}

/**
 * Validates bounds and retrieves array element.
 */
function getArrayElement(arrayValue: ArrayValue, index: number): Result<number> {
	if (index < 0 || index >= arrayValue.initializedCount) {
		return err(
			`Array index ${index} out of bounds (array has ${arrayValue.initializedCount} elements)`,
		);
	}

	const element = arrayValue.elements[index];
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (element === undefined) {
		return err(`Array element not found at index ${index}`);
	}

	return ok(element);
}

/**
 * Looks up array variable and returns element at index.
 */
function lookupArrayVariable(
	varName: string,
	index: number,
	context: ExecutionContext,
): Result<number> | undefined {
	for (const binding of context.bindings) {
		if (binding.name !== varName || binding.arrayValue === undefined) {
			continue;
		}
		return getArrayElement(binding.arrayValue, index);
	}
	return undefined;
}

/**
 * Evaluates array indexing access like array[0].
 */
export function tryParseArrayIndexing(
	expr: string,
	context: ExecutionContext,
	interpret: (input: string, ctx: ExecutionContext) => Result<number>,
): Result<number> | undefined {
	if (!looksLikeArrayIndexing(expr)) {
		return undefined;
	}

	const extraction = extractArrayIndexing(expr);
	if (extraction === undefined) {
		return undefined;
	}

	const { arrayExpr, indexExpr } = extraction;
	const trimmedArrayExpr = arrayExpr.trim();

	if (!isVariableName(trimmedArrayExpr)) {
		return undefined;
	}

	const indexResult = interpret(indexExpr, context);
	if (indexResult.type === 'err') {
		return indexResult;
	}

	const index = indexResult.value;
	const lookupResult = lookupArrayVariable(trimmedArrayExpr, index, context);
	return lookupResult;
}
