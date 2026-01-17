import { err, ok, type Result } from '../common/result';
import {
	findSemicolonOutsideBrackets,
	isVariableName,
	type ExecutionContext,
	type ParsedBinding,
	type VariableBinding,
	type ArrayValue,
} from '../common/types';
import { interpretInternal } from '../interpreter/evaluator';
import { handleStructInstantiation } from '../types/structs';
import { looksLikeIndexing } from '../types/arrays';

/**
 * Detects compound assignment operators (+=, -=, *=, /=, ||=, &&=).
 * Returns the operator or single char operator if found.
 */
function checkDoubleCharOperator(char: string): boolean {
	return char === '|' || char === '&';
}

/**
 * Detects compound assignment operators (+=, -=, *=, /=, ||=, &&=).
 * @param beforeEqualTrimmed - The part before the equals sign
 * @returns The detected operator or undefined
 */
function detectCompoundOperator(beforeEqualTrimmed: string): string | undefined {
	const lastCharBefore = beforeEqualTrimmed.charAt(beforeEqualTrimmed.length - 1);

	if (
		lastCharBefore === '+' ||
		lastCharBefore === '-' ||
		lastCharBefore === '*' ||
		lastCharBefore === '/'
	) {
		return lastCharBefore;
	}

	if (!checkDoubleCharOperator(lastCharBefore)) {
		return undefined;
	}

	if (beforeEqualTrimmed.length < 2) {
		return undefined;
	}

	const secondLastChar = beforeEqualTrimmed.charAt(beforeEqualTrimmed.length - 2);
	if (
		(secondLastChar === '|' && lastCharBefore === '|') ||
		(secondLastChar === '&' && lastCharBefore === '&')
	) {
		return secondLastChar + lastCharBefore;
	}

	return undefined;
}

/**
 * Finds the variable binding for the given variable name.
 */
function findVariableBinding(
	varName: string,
	context: ExecutionContext,
): VariableBinding | undefined {
	for (const binding of context.bindings) {
		if (binding.name === varName) {
			return binding;
		}
	}
	return undefined;
}

/**
 * Parses and validates assignment statement structure.
 */
interface ParsedAssignmentStructure {
	statementStr: string;
	remaining: string;
	equalIndex: number;
}

/**
 * Parses assignment statement structure.
 */
function parseAssignmentStructure(input: string): Result<ParsedAssignmentStructure> {
	const trimmed = input.trim();
	const semiIndex = findSemicolonOutsideBrackets(trimmed);
	if (semiIndex < 0) {
		return err('Assignment missing semicolon');
	}

	const statementStr = trimmed.substring(0, semiIndex).trim();
	const remaining = trimmed.substring(semiIndex + 1).trim();

	const equalIndex = statementStr.indexOf('=');
	if (equalIndex < 0 || equalIndex === 0) {
		return err('Invalid statement: expected assignment or variable declaration');
	}

	const charAfterEqual = statementStr.charAt(equalIndex + 1);
	if (charAfterEqual === '=') {
		return err('Invalid statement: expected assignment or variable declaration');
	}

	return ok({ statementStr, remaining, equalIndex });
}

/**
 * Extracts variable name from statement before equals sign.
 */
function extractVariableName(
	beforeEqualTrimmed: string,
	operator: string | undefined,
): Result<string> {
	let varNameEnd = beforeEqualTrimmed.length;
	if (operator !== undefined) {
		varNameEnd -= operator.length;
	}

	const varName = beforeEqualTrimmed.substring(0, varNameEnd).trim();
	if (!isVariableName(varName)) {
		return err(`Invalid variable name: ${varName}`);
	}

	return ok(varName);
}

/**
 * Validates mutable variable binding.
 */
function validateMutableBinding(varBinding: VariableBinding, varName: string): Result<void> {
	const isUninitialized = varBinding.value === undefined;
	if (!isUninitialized && !varBinding.isMutable) {
		return err(`Variable '${varName}' is not mutable`);
	}
	return ok(undefined as void);
}

/**
 * Constructs value string with compound operator handling.
 */
function buildValueString(
	statementStr: string,
	equalIndex: number,
	operator: string | undefined,
	varName: string,
): string {
	let valueStr = statementStr.substring(equalIndex + 1).trim();

	if (operator !== undefined) {
		valueStr = `${varName} ${operator} ${valueStr}`;
	}

	return valueStr;
}

/**
 * Attempts to parse a struct instantiation assignment.
 */
function tryParseStructAssignment(
	valueStr: string,
	varName: string,
	isMutable: boolean,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> | undefined {
	return handleStructInstantiation(varName, isMutable, valueStr, remaining, context);
}

/**
 * Represents extracted array assignment components (array name and index expression).
 */
interface ArrayAssignmentComponents {
	arrayName: string;
	indexExpr: string;
}

/**
 * Extracts array name and index from array[index] = value assignment.
 */
function extractArrayAssignmentComponents(
	beforeEqual: string,
): ArrayAssignmentComponents | undefined {
	const trimmed = beforeEqual.trim();
	const lastBracketIndex = trimmed.lastIndexOf('[');
	if (lastBracketIndex <= 0 || !trimmed.endsWith(']')) {
		return undefined;
	}

	const arrayName = trimmed.substring(0, lastBracketIndex).trim();
	const indexExpr = trimmed.substring(lastBracketIndex + 1, trimmed.length - 1).trim();

	if (!isVariableName(arrayName) || indexExpr.length === 0) {
		return undefined;
	}

	return { arrayName, indexExpr };
}

/**
 * Validates array binding exists and is mutable.
 */
function validateArrayBindingForAssignment(
	arrayBinding: VariableBinding | undefined,
	arrayName: string,
): Result<VariableBinding> {
	if (arrayBinding === undefined) {
		return err(`Undefined array: ${arrayName}`);
	}

	if (arrayBinding.arrayValue === undefined) {
		return err(`Variable '${arrayName}' is not an array`);
	}

	if (!arrayBinding.isMutable) {
		return err(`Array '${arrayName}' is not mutable`);
	}

	return ok(arrayBinding);
}

/**
 * Validates array index and evaluates to number.
 */
function evaluateArrayIndex(indexExpr: string, context: ExecutionContext): Result<number> {
	const indexResult = interpretInternal(indexExpr, context);
	if (indexResult.type === 'err') {
		return indexResult;
	}
	return ok(indexResult.value);
}

/**
 * Validates index is within bounds and sequential.
 */
function validateArrayIndexBounds(index: number, arrayValue: ArrayValue): Result<void> {
	if (index !== arrayValue.initializedCount) {
		return err(
			`Array index ${index} out of bounds (can only assign to next sequential index ${arrayValue.initializedCount})`,
		);
	}

	if (index < 0 || index >= arrayValue.totalCapacity) {
		return err(`Array index ${index} out of bounds (capacity: ${arrayValue.totalCapacity})`);
	}

	return ok(undefined as void);
}

/**
 * Evaluates the value to assign.
 */
function evaluateAssignmentValue(valueStr: string, context: ExecutionContext): Result<number> {
	const valueResult = interpretInternal(valueStr, context);
	if (valueResult.type === 'err') {
		return valueResult;
	}
	return ok(valueResult.value);
}

/**
 * Creates updated bindings with new array element.
 */
function createUpdatedBindingsWithArrayElement(
	arrayName: string,
	value: number,
	bindings: VariableBinding[],
): VariableBinding[] {
	return bindings.map((binding): VariableBinding => {
		if (binding.name === arrayName && binding.arrayValue !== undefined) {
			const newElements = [...binding.arrayValue.elements];
			newElements.push(value);
			return {
				...binding,
				arrayValue: {
					...binding.arrayValue,
					elements: newElements,
					initializedCount: binding.arrayValue.initializedCount + 1,
				},
			};
		}
		return binding;
	});
}

/**
 * Handles array element assignment (array[index] = value).
 */
/**
 * Builds the result for successful array element assignment.
 */
function buildArrayAssignmentResult(
	arrayName: string,
	remaining: string,
	updatedBindings: VariableBinding[],
): Result<ParsedBinding> {
	return ok({
		name: arrayName,
		value: undefined,
		isMutable: true,
		remaining,
		arrayAssignmentUpdatedBindings: updatedBindings,
	});
}

/**
 * Handles array element assignment (array[index] = value).
 */
function parseArrayElementAssignment(
	beforeEqual: string,
	valueStr: string,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> | undefined {
	const components = extractArrayAssignmentComponents(beforeEqual);
	if (components === undefined) {
		return undefined;
	}

	const { arrayName, indexExpr } = components;

	// Find array binding
	const arrayBinding = findVariableBinding(arrayName, context);

	const validatedBinding = validateArrayBindingForAssignment(arrayBinding, arrayName);
	if (validatedBinding.type === 'err') {
		return validatedBinding;
	}

	const index = evaluateArrayIndex(indexExpr, context);
	if (index.type === 'err') {
		return index;
	}

	// arrayValue is guaranteed to exist after validateArrayBindingForAssignment
	const arrayValue = validatedBinding.value.arrayValue;
	if (arrayValue === undefined) {
		return err('Array value not found');
	}

	const boundsValidation = validateArrayIndexBounds(index.value, arrayValue);
	if (boundsValidation.type === 'err') {
		return boundsValidation;
	}

	const value = evaluateAssignmentValue(valueStr, context);
	if (value.type === 'err') {
		return value;
	}

	const updatedBindings = createUpdatedBindingsWithArrayElement(
		arrayName,
		value.value,
		context.bindings,
	);

	return buildArrayAssignmentResult(arrayName, remaining, updatedBindings);
}

/**
 * Handles simple variable assignment (var = value).
 */
function parseSimpleVariableAssignment(
	beforeEqualTrimmed: string,
	statementStr: string,
	equalIndex: number,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> {
	const operator = detectCompoundOperator(beforeEqualTrimmed);

	const varNameResult = extractVariableName(beforeEqualTrimmed, operator);
	if (varNameResult.type === 'err') {
		return varNameResult;
	}

	const varName = varNameResult.value;
	const varBinding = findVariableBinding(varName, context);
	if (varBinding === undefined) {
		return err(`Undefined variable: ${varName}`);
	}

	const validationResult = validateMutableBinding(varBinding, varName);
	if (validationResult.type === 'err') {
		return validationResult;
	}

	const valueStr = buildValueString(statementStr, equalIndex, operator, varName);

	if (operator === undefined) {
		const structAssign = tryParseStructAssignment(
			valueStr,
			varName,
			varBinding.isMutable,
			remaining,
			context,
		);
		if (structAssign !== undefined) {
			return structAssign;
		}
	}

	const valueResult = interpretInternal(valueStr, context);
	if (valueResult.type === 'err') {
		return valueResult;
	}

	return ok({ name: varName, value: valueResult.value, isMutable: varBinding.isMutable, remaining });
}

/**
 * Checks if the left side is a this.field expression.
 */
function isThisFieldExpression(beforeEqual: string): boolean {
	const trimmed = beforeEqual.trim();
	if (!trimmed.startsWith('this.')) {
		return false;
	}
	const fieldName = trimmed.substring(5).trim();
	return isVariableName(fieldName);
}

/**
 * Handles this.field = value assignment.
 */
function parseThisFieldAssignment(
	beforeEqual: string,
	valueStr: string,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> {
	const trimmed = beforeEqual.trim();
	const fieldName = trimmed.substring(5).trim();

	const varBinding = findVariableBinding(fieldName, context);
	if (varBinding === undefined) {
		return err(`Undefined variable: ${fieldName}`);
	}

	const validationResult = validateMutableBinding(varBinding, fieldName);
	if (validationResult.type === 'err') {
		return validationResult;
	}

	const valueResult = interpretInternal(valueStr, context);
	if (valueResult.type === 'err') {
		return valueResult;
	}

	return ok({
		name: fieldName,
		value: valueResult.value,
		isMutable: varBinding.isMutable,
		remaining,
	});
}

/**
 * Parses a variable assignment statement.
 * @param input - The assignment statement string
 * @param context - The execution context with variable bindings
 * @returns A ParsedBinding result with the updated variable and remaining input
 */
export function parseAssignment(input: string, context: ExecutionContext): Result<ParsedBinding> {
	const structResult = parseAssignmentStructure(input);
	if (structResult.type === 'err') {
		return structResult;
	}

	const { statementStr, remaining, equalIndex } = structResult.value;

	const beforeEqualTrimmed = statementStr.substring(0, equalIndex).trimEnd();

	// Check if it's this.field assignment
	if (isThisFieldExpression(beforeEqualTrimmed)) {
		const valueStr = statementStr.substring(equalIndex + 1).trim();
		return parseThisFieldAssignment(beforeEqualTrimmed, valueStr, remaining, context);
	}

	// Check if it's array element assignment
	if (looksLikeIndexing(beforeEqualTrimmed)) {
		const valueStr = statementStr.substring(equalIndex + 1).trim();
		const arrayAssignResult = parseArrayElementAssignment(
			beforeEqualTrimmed,
			valueStr,
			remaining,
			context,
		);
		if (arrayAssignResult !== undefined) {
			return arrayAssignResult;
		}
	}

	return parseSimpleVariableAssignment(
		beforeEqualTrimmed,
		statementStr,
		equalIndex,
		remaining,
		context,
	);
}
