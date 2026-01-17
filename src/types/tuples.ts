import { err, ok, type Result } from '../common/result';
import {
	type TupleType,
	type TupleValue,
	type ExecutionContext,
	validateValueForType,
	type ParsedBinding,
	isVariableName,
} from '../common/types';
import { interpretInternal } from '../interpreter/evaluator';
import { tryParseArrayIndexing, looksLikeIndexing } from './arrays';

/**
 * Represents extracted tuple indexing components.
 */
interface TupleIndexingExtraction {
	tupleExpr: string;
	indexExpr: string;
}

/**
 * Parses a tuple type annotation like (I32, U8, I32).
 */
export function parseTupleType(typeStr: string): Result<TupleType> {
	const trimmed = typeStr.trim();
	if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
		return err('Invalid tuple type');
	}

	const inner = trimmed.substring(1, trimmed.length - 1).trim();
	const parts = inner.split(',').map((p): string => p.trim());

	if (parts.length === 0 || parts.some((p): boolean => p.length === 0)) {
		return err('Tuple must have at least one element with non-empty types');
	}

	return ok({ elementTypes: parts });
}

/**
 * Checks if a string looks like a tuple literal (1, 2, 3).
 */
export function looksLikeTupleLiteral(expr: string): boolean {
	const trimmed = expr.trim();
	if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
		return false;
	}

	// Check if it's a tuple type annotation instead of a literal
	// Tuple types have commas between type names, literals have commas between values
	const inner = trimmed.substring(1, trimmed.length - 1);
	if (inner.length === 0) {
		return false;
	}

	return true;
}

/**
 * Parses and evaluates a tuple literal (1, 2, 3).
 */
export function parseTupleLiteral(expr: string, context: ExecutionContext): Result<TupleValue> {
	const trimmed = expr.trim();
	if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
		return err('Invalid tuple literal');
	}

	const inner = trimmed.substring(1, trimmed.length - 1).trim();
	if (inner.length === 0) {
		return err('Tuple literal cannot be empty');
	}

	const elements: number[] = [];
	const parts = splitTupleElements(inner);

	for (const part of parts) {
		const trimmedPart = part.trim();
		if (trimmedPart.length === 0) {
			return err('Tuple literal contains empty element');
		}

		const result = interpretInternal(trimmedPart, context);
		if (result.type === 'err') {
			return result;
		}

		elements.push(result.value);
	}

	return ok({
		elementTypes: [],
		elements,
	});
}

/**
 * Splits tuple elements by comma, respecting nested brackets.
 */
function splitTupleElements(inner: string): string[] {
	const elements: string[] = [];
	let current = '';
	let parenDepth = 0;
	let bracketDepth = 0;
	let braceDepth = 0;

	for (let i = 0; i < inner.length; i++) {
		const char = inner[i];
		if (char === '(') {
			parenDepth++;
		} else if (char === ')') {
			parenDepth--;
		} else if (char === '[') {
			bracketDepth++;
		} else if (char === ']') {
			bracketDepth--;
		} else if (char === '{') {
			braceDepth++;
		} else if (char === '}') {
			braceDepth--;
		} else if (char === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
			elements.push(current);
			current = '';
			continue;
		}

		current += char;
	}

	if (current.length > 0) {
		elements.push(current);
	}

	return elements;
}

/**
 * Validates that tuple initialization matches the type definition.
 */
export function validateTupleInitialization(
	tupleLiteral: TupleValue,
	tupleType: TupleType,
): Result<void> {
	if (tupleLiteral.elements.length !== tupleType.elementTypes.length) {
		return err(
			`Tuple element count mismatch: expected ${tupleType.elementTypes.length}, got ${tupleLiteral.elements.length}`,
		);
	}

	for (let i = 0; i < tupleLiteral.elements.length; i++) {
		const element = tupleLiteral.elements[i];
		const elementType = tupleType.elementTypes[i];
		const validation = validateValueForType(element, elementType);
		if (validation.type === 'err') {
			return validation;
		}
	}

	return ok(undefined as void);
}

/**
 * Handles tuple type variable binding.
 */
export function parseTupleTypeBinding(
	varName: string,
	isMutable: boolean,
	typeAnnotation: string,
	valueStr: string,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> {
	const typeResult = parseTupleType(typeAnnotation);
	if (typeResult.type === 'err') {
		return typeResult;
	}

	const tupleType = typeResult.value;

	if (!looksLikeTupleLiteral(valueStr)) {
		return err('Expected tuple literal for tuple variable');
	}

	const literalResult = parseTupleLiteral(valueStr, context);
	if (literalResult.type === 'err') {
		return literalResult;
	}

	const tupleLiteral = literalResult.value;
	tupleLiteral.elementTypes = tupleType.elementTypes;

	const validationResult = validateTupleInitialization(tupleLiteral, tupleType);
	if (validationResult.type === 'err') {
		return validationResult;
	}

	return ok({
		name: varName,
		value: undefined,
		isMutable,
		remaining,
		tupleValue: tupleLiteral,
	});
}

/**
 * Checks if input looks like tuple indexing (var[index]).
 * Reuses generic indexing detection since both tuples and arrays use same syntax.
 */
export function looksLikeTupleIndexing(expr: string): boolean {
	return looksLikeIndexing(expr);
}

/**
 * Extracts tuple name and index from tuple[index] expression.
 */
function extractTupleIndexing(expr: string): TupleIndexingExtraction | undefined {
	const trimmed = expr.trim();
	const bracketIndex = trimmed.lastIndexOf('[');
	if (bracketIndex <= 0 || !trimmed.endsWith(']')) {
		return undefined;
	}

	const tupleExpr = trimmed.substring(0, bracketIndex).trim();
	const indexExpr = trimmed.substring(bracketIndex + 1, trimmed.length - 1).trim();

	if (tupleExpr.length === 0 || indexExpr.length === 0) {
		return undefined;
	}

	return { tupleExpr, indexExpr };
}

/**
 * Validates bounds and retrieves tuple element.
 */
function getTupleElement(tupleValue: TupleValue, index: number): Result<number> {
	if (index < 0 || index >= tupleValue.elements.length) {
		return err(
			`Tuple index ${index} out of bounds (tuple has ${tupleValue.elements.length} elements)`,
		);
	}

	const element = tupleValue.elements[index];
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (element === undefined) {
		return err(`Tuple element not found at index ${index}`);
	}

	return ok(element);
}

/**
 * Looks up tuple variable and returns element at index.
 */
function lookupTupleVariable(
	varName: string,
	index: number,
	context: ExecutionContext,
): Result<number> | undefined {
	for (const binding of context.bindings) {
		if (binding.name !== varName || binding.tupleValue === undefined) {
			continue;
		}
		return getTupleElement(binding.tupleValue, index);
	}
	return undefined;
}

/**
 * Evaluates indexing access for arrays and tuples (both use same syntax).
 */
export function tryParseIndexing(
	expr: string,
	context: ExecutionContext,
	interpret: (input: string, ctx: ExecutionContext) => Result<number>,
): Result<number> | undefined {
	const arrayResult = tryParseArrayIndexing(expr, context, interpret);
	if (arrayResult !== undefined) {
		return arrayResult;
	}

	return tryParseTupleIndexing(expr, context, interpret);
}

/**
 * Evaluates tuple indexing access like tuple[0].
 */
function tryParseTupleIndexing(
	expr: string,
	context: ExecutionContext,
	interpret: (input: string, ctx: ExecutionContext) => Result<number>,
): Result<number> | undefined {
	if (!looksLikeTupleIndexing(expr)) {
		return undefined;
	}

	const extraction = extractTupleIndexing(expr);
	if (extraction === undefined) {
		return undefined;
	}

	const { tupleExpr, indexExpr } = extraction;
	const trimmedTupleExpr = tupleExpr.trim();

	if (!isVariableName(trimmedTupleExpr)) {
		return undefined;
	}

	const indexResult = interpret(indexExpr, context);
	if (indexResult.type === 'err') {
		return indexResult;
	}

	const index = indexResult.value;
	const lookupResult = lookupTupleVariable(trimmedTupleExpr, index, context);
	return lookupResult;
}
