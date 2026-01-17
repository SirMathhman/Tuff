import { err, ok, type Result } from './result';
import {
	type ExecutionContext,
	extractTypeSuffix,
	findTypeSuffixStart,
	hasNegativeSign,
	isBalancedBrackets,
	isVariableName,
	type IfElseComponents,
	validateValueForType,
	isMatchKeyword,
	extractMatchExpression,
} from './types';
import {
	extractIfConditionAndAfter,
	findElseKeywordIndex,
	type IfConditionAndAfter,
} from './helpers';
import { ReturnSignal } from './function-call-utils';
import { tryParseCallExpression } from './call-expressions';
import { tryParseFieldAccess } from './field-access';

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

function findIfElseComponents(input: string): IfElseComponents | undefined {
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

function lookupVariable(name: string, context: ExecutionContext): Result<number> {
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

export function parseLiteral(
	literal: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
	processVariableBindings?: ProcessVariableBindingsFunction,
): Result<number> {
	const callExprResult = tryParseCallExpression(literal, context, interpretInternal);
	if (callExprResult !== undefined) {
		return callExprResult;
	}

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
