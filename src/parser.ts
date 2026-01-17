import { err, ok, type Result } from './result';
import {
	checkSingleCharOperator,
	checkTwoCharOperator,
	type ExecutionContext,
	extractTypeSuffix,
	findTypeSuffixStart,
	hasNegativeSign,
	isBalancedBrackets,
	isVariableName,
	type IfElseComponents,
	type OperatorMatch,
	type OperatorPrecedenceState,
	validateValueForType,
	isMatchKeyword,
	extractMatchExpression,
} from './types';
import {
	extractIfConditionAndAfter,
	findElseKeywordIndex,
	type IfConditionAndAfter,
} from './helpers';
import { evaluateStructInstantiation } from './structs';
import { getFunctionDefinition, type FunctionDefinition } from './functions';
import {
	createCallContext,
	extractFunctionCallExpression,
	ReturnSignal,
} from './function-call-utils';

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

interface FieldAccessExpression {
	instanceExpr: string;
	fieldName: string;
}

export function hasFieldAccess(literal: string): boolean {
	const trimmed = literal.trim();
	const dotIndex = trimmed.lastIndexOf('.');
	if (dotIndex <= 0) {
		return false;
	}

	const beforeDot = trimmed.substring(0, dotIndex);

	const hasClosingBrace = beforeDot.includes('}');
	if (hasClosingBrace) {
		return true;
	}

	return isVariableName(beforeDot.trim());
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
	const parsed: IfConditionAndAfter | undefined = extractIfConditionAndAfter(afterIf);
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

function evaluateFunctionCallArguments(
	def: FunctionDefinition,
	args: string[],
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number[]> {
	const values: number[] = [];
	for (let i = 0; i < def.parameters.length; i++) {
		const argResult = interpretInternal(args[i], context);
		if (argResult.type === 'err') {
			return argResult;
		}

		const param = def.parameters[i];
		const typeCheck = validateValueForType(argResult.value, param.typeAnnotation);
		if (typeCheck.type === 'err') {
			return typeCheck;
		}

		values.push(argResult.value);
	}

	return ok(values);
}

function tryParseFunctionCall(
	literal: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> | undefined {
	const parsed = extractFunctionCallExpression(literal);
	if (parsed === undefined) {
		return undefined;
	}

	const def = getFunctionDefinition(parsed.functionName);
	if (def === undefined) {
		return err(`Undefined function: ${parsed.functionName}`);
	}

	if (parsed.args.length !== def.parameters.length) {
		return err(
			`Function '${def.name}' expects ${def.parameters.length} argument(s), got ${parsed.args.length}`,
		);
	}

	const argValuesResult = evaluateFunctionCallArguments(
		def,
		parsed.args,
		context,
		interpretInternal,
	);
	if (argValuesResult.type === 'err') {
		return argValuesResult;
	}

	const callContext = createCallContext(def, argValuesResult.value, context);
	let bodyResult: Result<number>;
	try {
		bodyResult = interpretInternal(def.bodyExpression, callContext);
	} catch (error) {
		if (error instanceof ReturnSignal) {
			return validateValueForType(error.value, def.returnType);
		}
		throw error;
	}
	if (bodyResult.type === 'err') {
		return bodyResult;
	}

	return validateValueForType(bodyResult.value, def.returnType);
}

/**
 * Attempts to parse field access expression.
 */
/**
 * Looks up a field on a struct variable in the context.
 */
function lookupStructVariableField(
	varName: string,
	fieldName: string,
	context: ExecutionContext,
): Result<number> | undefined {
	for (const binding of context.bindings) {
		if (binding.name !== varName || binding.structValue === undefined) {
			continue;
		}
		const fieldValue = binding.structValue.values[fieldName];
		if (typeof fieldValue === 'number') {
			return ok(fieldValue);
		}
		return err(`Field '${fieldName}' not found in struct '${binding.structValue.structType}'`);
	}
	return undefined;
}

/**
 * Handles field access on either a struct instantiation or a struct variable.
 */
function tryParseFieldAccess(
	literal: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> | undefined {
	if (!hasFieldAccess(literal)) {
		return undefined;
	}

	const fieldAccessResult = extractFieldAccess(literal);
	if (fieldAccessResult === undefined) {
		return undefined;
	}

	const { instanceExpr, fieldName } = fieldAccessResult;
	const trimmedExpr = instanceExpr.trim();

	// Check if instanceExpr is a variable name (simple identifier)
	if (isVariableName(trimmedExpr)) {
		const lookupResult = lookupStructVariableField(trimmedExpr, fieldName, context);
		if (lookupResult !== undefined) {
			return lookupResult;
		}
		// Simple variable found but not a struct variable, don't try struct instantiation
		return undefined;
	}

	// Try to evaluate as struct instantiation (e.g., Wrapper { field : 100 }.field)
	const instanceResult = evaluateStructInstantiation(
		instanceExpr,
		(expr): Result<number> => interpretInternal(expr, context),
	);

	if (instanceResult.type === 'err') {
		return instanceResult;
	}

	const fieldValue = instanceResult.value.fieldValues[fieldName];
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (fieldValue === undefined) {
		return err(`Field '${fieldName}' not found in struct '${instanceResult.value.structType}'`);
	}

	return ok(fieldValue);
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
	// Handle field access first (e.g., Wrapper { field : 100 }.field or myWrapper.field)
	const fieldAccessResult = tryParseFieldAccess(literal, context, interpretInternal);
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

	const callResult = tryParseFunctionCall(literal, context, interpretInternal);
	if (callResult !== undefined) {
		return callResult;
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
	if (Number.isNaN(value)) {
		return err(`Invalid number literal: ${trimmed}`);
	}

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

function handleReturnMarker(
	trimmedRemaining: string,
	newContext: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> | undefined {
	if (!trimmedRemaining.startsWith('__RETURN__:')) {
		return undefined;
	}

	const afterReturn = trimmedRemaining.substring(11);
	const endMarkerIndex = afterReturn.indexOf(':__');
	if (endMarkerIndex < 0) {
		return undefined;
	}

	const returnExprStr = afterReturn.substring(0, endMarkerIndex);
	const returnResult = interpretInternal(returnExprStr, newContext);
	if (returnResult.type === 'err') {
		return returnResult;
	}
	throw new ReturnSignal(returnResult.value);
}

function handleYieldMarker(
	trimmedRemaining: string,
	newContext: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> | undefined {
	if (!trimmedRemaining.startsWith('__YIELD__:')) {
		return undefined;
	}

	const afterYield = trimmedRemaining.substring(10);
	const endMarkerIndex = afterYield.indexOf(':__');
	if (endMarkerIndex < 0) {
		return undefined;
	}

	const yieldExprStr = afterYield.substring(0, endMarkerIndex);
	return interpretInternal(yieldExprStr, newContext);
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

	const returnResult = handleReturnMarker(trimmedRemaining, newContext, interpretInternal);
	if (returnResult !== undefined) {
		return returnResult;
	}

	const yieldResult = handleYieldMarker(trimmedRemaining, newContext, interpretInternal);
	if (yieldResult !== undefined) {
		return yieldResult;
	}

	if (trimmedRemaining.length === 0) {
		return err('Braced expression must contain an expression after variable declarations');
	}

	return interpretInternal(trimmedRemaining, newContext);
}
