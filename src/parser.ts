import { err, ok, type Result } from './result';
import {
	checkSingleCharOperator,
	checkTwoCharOperator,
	type ExecutionContext,
	extractTypeSuffix,
	findElseKeywordIndex,
	findTypeSuffixStart,
	hasNegativeSign,
	isBalancedBrackets,
	isVariableName,
	type IfElseComponents,
	type OperatorMatch,
	type OperatorPrecedenceState,
	validateValueForType,
	extractIfConditionAndAfter,
	isMatchKeyword,
	extractMatchExpression,
	findClosingBrace,
} from './types';
import { getStructDefinition, type StructDefinition } from './structs';

interface InterpretFunction {
	(input: string, context: ExecutionContext): Result<number>;
}

interface ProcessVariableBindingsResult {
	context: ExecutionContext;
	remaining: string;
}

interface ProcessVariableBindingsFunction {
	(input: string, context: ExecutionContext): Result<ProcessVariableBindingsResult>;
}

/**
 * Represents a field access expression result.
 */
interface FieldAccessExpression {
	instanceExpr: string;
	fieldName: string;
}

/**
 * Checks if literal looks like struct instantiation with field access.
 */
export function hasFieldAccess(literal: string): boolean {
	const trimmed = literal.trim();
	const dotIndex = trimmed.lastIndexOf('.');
	if (dotIndex <= 0) {
		return false;
	}

	// Check if there's a closing brace before the dot
	const beforeDot = trimmed.substring(0, dotIndex);
	const hasClosingBrace = beforeDot.includes('}');

	return hasClosingBrace;
}

/**
 * Extracts struct instantiation and field name from expression.
 */
export function extractFieldAccess(literal: string): FieldAccessExpression | undefined {
	const trimmed = literal.trim();
	const dotIndex = trimmed.lastIndexOf('.');
	if (dotIndex <= 0) {
		return undefined;
	}

	const instanceExpr = trimmed.substring(0, dotIndex);
	const fieldName = trimmed.substring(dotIndex + 1).trim();

	if (fieldName.length === 0 || !isVariableName(fieldName)) {
		return undefined;
	}

	return { instanceExpr, fieldName };
}

/**
 * Parses a single struct field assignment.
 */
function parseStructField(
	decl: string,
	structDef: StructDefinition,
): Result<[string, number]> | undefined {
	const trimmedDecl = decl.trim();
	if (trimmedDecl.length === 0) {
		return undefined;
	}

	const colonIndex = trimmedDecl.indexOf(':');
	if (colonIndex < 0) {
		return err(`Invalid struct field assignment: ${trimmedDecl}`);
	}

	const fieldName = trimmedDecl.substring(0, colonIndex).trim();
	const fieldValueStr = trimmedDecl.substring(colonIndex + 1).trim();

	const fieldDef = structDef.fields.find((f): boolean => f.name === fieldName);
	if (!fieldDef) {
		return err(`Struct has no field '${fieldName}'`);
	}

	const fieldValue = Number.parseInt(fieldValueStr, 10);
	if (Number.isNaN(fieldValue)) {
		return err(`Invalid field value for '${fieldName}': ${fieldValueStr}`);
	}

	return ok([fieldName, fieldValue]);
}

/**
 * Processes a single field declaration in struct instantiation.
 */
function processStructInstantiationField(
	decl: string,
	structDef: StructDefinition,
	fieldValues: Record<string, number>,
): Result<void> {
	const result = parseStructField(decl, structDef);
	if (result === undefined) {
		return ok(undefined as void);
	}

	if (result.type === 'err') {
		return result;
	}

	const [fieldName, fieldValue] = result.value;
	fieldValues[fieldName] = fieldValue;
	return ok(undefined as void);
}

/**
 * Evaluates struct instantiation by parsing field values.
 */
export function evaluateStructInstantiation(
	instanceExpr: string,
): Result<Record<string, number>> | undefined {
	const trimmed = instanceExpr.trim();
	const braceIndex = trimmed.indexOf('{');
	if (braceIndex <= 0) {
		return undefined;
	}

	const typeName = trimmed.substring(0, braceIndex).trim();
	if (!isVariableName(typeName)) {
		return undefined;
	}

	const structDef = getStructDefinition(typeName);
	if (structDef === undefined) {
		return undefined;
	}

	const closeIndex = findClosingBrace(trimmed.substring(braceIndex));
	if (closeIndex < 0) {
		return err('Struct instantiation missing closing brace');
	}

	const bodyStr = trimmed.substring(braceIndex + 1, braceIndex + closeIndex);
	const fieldValues: Record<string, number> = {};

	const fieldDecls = bodyStr.split(',');
	for (const decl of fieldDecls) {
		const fieldResult = processStructInstantiationField(decl, structDef, fieldValues);
		if (fieldResult.type === 'err') {
			return fieldResult;
		}
	}

	return ok(fieldValues);
}

/**
 * Looks up a variable value in the execution context.
 */
export function lookupVariable(name: string, context: ExecutionContext): Result<number> {
	for (const binding of context.bindings) {
		if (binding.name !== name) {
			continue;
		}
		if (binding.value === undefined) {
			return err(`Variable '${name}' is not initialized`);
		}
		return ok(binding.value);
	}
	return err(`Undefined variable: ${name}`);
}

/**
 * Finds the components of an if-else expression.
 */
export function findIfElseComponents(input: string): IfElseComponents | undefined {
	const trimmed = input.trim();
	if (!trimmed.startsWith('if ')) {
		return undefined;
	}

	const afterIf = trimmed.substring(3).trim();
	const parsed = extractIfConditionAndAfter(afterIf);
	if (parsed === undefined) {
		return undefined;
	}

	const elseIndex = findElseKeywordIndex(parsed.afterCondition);
	if (elseIndex < 0) {
		return undefined;
	}

	const trueExprStr = parsed.afterCondition.substring(0, elseIndex).trim();
	const falseExprStr = parsed.afterCondition.substring(elseIndex + 4).trim();

	if (trueExprStr.length === 0 || falseExprStr.length === 0) {
		return undefined;
	}

	return { conditionStr: parsed.conditionStr, trueExprStr, falseExprStr };
}

/**
 * Updates the lowest precedence state with a new operator.
 */
function updateLowestPrecedence(
	precedence: number,
	index: number,
	operator: string,
	state: OperatorPrecedenceState,
): void {
	if (precedence <= state.lowestPrecedence) {
		state.lowestPrecedence = precedence;
		state.lowestPrecedenceIndex = index;
		state.lowestPrecedenceOperator = operator;
	}
}

/**
 * Checks for operators at a specific position in the input.
 */
function checkOperatorAtPosition(
	input: string,
	i: number,
	char: string,
	operators: string[],
	state: OperatorPrecedenceState,
): number {
	if (i < input.length - 1) {
		const twoCharPrec = checkTwoCharOperator(input, i, operators);
		if (twoCharPrec >= 0) {
			updateLowestPrecedence(twoCharPrec, i, input.substring(i, i + 2), state);
			return 1; // Signal to skip next char
		}
	}
	const singleCharPrec = checkSingleCharOperator(input, char, i, operators);
	if (singleCharPrec >= 0) {
		updateLowestPrecedence(singleCharPrec, i, char, state);
	}
	return 0;
}

/**
 * Finds the lowest-precedence operator in an expression.
 */
export function findOperator(input: string): OperatorMatch | undefined {
	const operators = ['+', '-', '*', '/', '||', '&&', '<', '>', '<=', '>=', '==', '!='];
	const state: OperatorPrecedenceState = {
		lowestPrecedence: Infinity,
		lowestPrecedenceIndex: -1,
		lowestPrecedenceOperator: '',
	};
	let bracketDepth = 0;
	if (input.startsWith('(') || input.startsWith('{')) {
		bracketDepth = 1;
	}
	for (let i = 1; i < input.length; i++) {
		const char = input[i];
		if (char === '(' || char === '{') {
			bracketDepth++;
			continue;
		}
		if (char === ')' || char === '}') {
			bracketDepth--;
			continue;
		}
		if (bracketDepth > 0) {
			continue;
		}
		const skip = checkOperatorAtPosition(input, i, char, operators, state);
		if (skip) {
			i++;
		}
	}
	if (state.lowestPrecedenceIndex < 0) {
		return undefined;
	}
	return {
		operator: state.lowestPrecedenceOperator,
		index: state.lowestPrecedenceIndex,
		precedence: state.lowestPrecedence,
	};
}

/**
 * Checks if a literal is a boolean or variable, handling early cases.
 */
function parseSimpleLiteral(
	trimmed: string,
	context: ExecutionContext,
): Result<number> | undefined {
	if (trimmed === 'true') {
		return ok(1);
	}

	if (trimmed === 'false') {
		return ok(0);
	}

	if (isVariableName(trimmed)) {
		return lookupVariable(trimmed, context);
	}

	return undefined;
}

/**
 * Attempts to parse field access expression.
 */
function tryParseFieldAccess(literal: string): Result<number> | undefined {
	if (!hasFieldAccess(literal)) {
		return undefined;
	}

	const fieldAccessResult = extractFieldAccess(literal);
	if (fieldAccessResult === undefined) {
		return undefined;
	}

	const instanceResult = evaluateStructInstantiation(fieldAccessResult.instanceExpr);
	if (instanceResult === undefined) {
		return undefined;
	}

	if (instanceResult.type === 'err') {
		return instanceResult;
	}

	const fieldValues = instanceResult.value;
	const value = fieldValues[fieldAccessResult.fieldName];
	if (typeof value === 'number') {
		return ok(value);
	}

	return err(`Field '${fieldAccessResult.fieldName}' not found in struct instance`);
}

/**
 * Parses a literal value (number, variable, parenthesized expression, braced block, if-else).
 * Requires interpretInternal from evaluator for recursive evaluation.
 */
export function parseLiteral(
	literal: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
	processVariableBindings?: ProcessVariableBindingsFunction,
): Result<number> {
	// Handle field access first (e.g., Wrapper { field : 100 }.field)
	const fieldAccessResult = tryParseFieldAccess(literal);
	if (fieldAccessResult !== undefined) {
		return fieldAccessResult;
	}

	const matchResult = parseMatchExpression(literal, context, interpretInternal);
	if (matchResult !== undefined) {
		return matchResult;
	}

	const ifElseResult = parseIfElseExpression(literal, context, interpretInternal);
	if (ifElseResult !== undefined) {
		return ifElseResult;
	}

	const trimmed = literal.trim();
	const simpleLiteral = parseSimpleLiteral(trimmed, context);
	if (simpleLiteral !== undefined) {
		return simpleLiteral;
	}

	if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
		if (isBalancedBrackets(trimmed)) {
			const inner = trimmed.substring(1, trimmed.length - 1);
			return interpretInternal(inner, context);
		}
	}

	if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
		return parseBracedExpression(trimmed, context, interpretInternal, processVariableBindings);
	}

	return parseNumberLiteral(trimmed);
}

/**
 * Parses a number literal with optional type suffix.
 */
function parseNumberLiteral(trimmed: string): Result<number> {
	const suffixStart = findTypeSuffixStart(trimmed);
	let numberPart: string;
	if (suffixStart >= 0) {
		numberPart = trimmed.substring(0, suffixStart);
		if (hasNegativeSign(numberPart)) {
			return err('Negative numbers are not supported for unsigned types');
		}
	} else {
		numberPart = trimmed;
	}

	const value = Number.parseInt(numberPart, 10);
	if (suffixStart >= 0) {
		const typeSuffix = extractTypeSuffix(trimmed, suffixStart);
		return validateValueForType(value, typeSuffix);
	}
	return ok(value);
}

/**
 * Parses a match expression.
 */
function parseMatchExpression(
	input: string,
	context: ExecutionContext,
	interpretInternal: (input: string, ctx: ExecutionContext) => Result<number>,
): Result<number> | undefined {
	if (!isMatchKeyword(input)) {
		return undefined;
	}

	const parsed = extractMatchExpression(input);
	if (parsed === undefined) {
		return undefined;
	}

	const matchResult = interpretInternal(parsed.matchExpr, context);
	if (matchResult.type === 'err') {
		return matchResult;
	}

	const matchValue = matchResult.value;
	for (const matchCase of parsed.cases) {
		const pattern = matchCase.pattern.trim();

		if (pattern === '_') {
			return interpretInternal(matchCase.result, context);
		}

		const caseValue = Number.parseInt(pattern, 10);
		if (!Number.isNaN(caseValue) && caseValue === matchValue) {
			return interpretInternal(matchCase.result, context);
		}
	}

	return err('No matching case in match expression');
}

/**
 * Parses an if-else expression.
 */
function parseIfElseExpression(
	input: string,
	context: ExecutionContext,
	interpretInternal: (input: string, ctx: ExecutionContext) => Result<number>,
): Result<number> | undefined {
	const components = findIfElseComponents(input);
	if (components === undefined) {
		return undefined;
	}

	const conditionResult = interpretInternal(components.conditionStr, context);
	if (conditionResult.type === 'err') {
		return conditionResult;
	}

	const isTruthy = conditionResult.value !== 0;
	if (isTruthy) {
		return interpretInternal(components.trueExprStr, context);
	}
	return interpretInternal(components.falseExprStr, context);
}

/**
 * Parses a braced expression.
 * Requires processVariableBindings passed from statements module to avoid circular imports.
 */
function parseBracedExpression(
	trimmed: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
	processVariableBindings?: ProcessVariableBindingsFunction,
): Result<number> {
	if (!isBalancedBrackets(trimmed)) {
		return err('Unbalanced brackets');
	}

	if (processVariableBindings === undefined) {
		return err('Internal error: processVariableBindings not provided');
	}

	const inner = trimmed.substring(1, trimmed.length - 1);
	const bindingsResult = processVariableBindings(inner, context);
	if (bindingsResult.type === 'err') {
		return bindingsResult;
	}

	const { context: newContext, remaining } = bindingsResult.value;
	const trimmedRemaining = remaining.trim();

	// Check if yield was encountered
	if (trimmedRemaining.startsWith('__YIELD__:')) {
		const afterYield = trimmedRemaining.substring(10); // Remove __YIELD__:
		const endMarkerIndex = afterYield.indexOf(':__');
		if (endMarkerIndex >= 0) {
			const yieldExprStr = afterYield.substring(0, endMarkerIndex);
			return interpretInternal(yieldExprStr, newContext);
		}
	}

	if (trimmedRemaining.length === 0) {
		return err('Braced expression must contain an expression after variable declarations');
	}

	return interpretInternal(trimmedRemaining, newContext);
}
