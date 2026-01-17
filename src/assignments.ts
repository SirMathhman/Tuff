import { err, ok, type Result } from './result';
import {
	findSemicolonOutsideBrackets,
	isVariableName,
	type ExecutionContext,
	type ParsedBinding,
	type VariableBinding,
} from './types';
import { interpretInternal } from './evaluator';
import { handleStructInstantiation } from './structs';

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
