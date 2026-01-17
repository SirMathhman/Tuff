import { err, ok, type Result } from './common/result';
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
} from './common/types';
import {
	extractIfConditionAndAfter,
	findElseKeywordIndex,
	type IfConditionAndAfter,
	copyBindingValues,
} from './common/helpers';
import { ReturnSignal } from './function-call-utils';
import { tryParseCallExpression } from './call-expressions';
import { tryParseFieldAccess } from './field-access';
import { tryParseIndexing } from './tuples';
import { tryParseEnumMemberAccess } from './enums';
import { getFunctionDefinition } from './functions';
import {
	captureFunctionReferenceByName,
	captureFunctionReferenceFromBinding,
	setLastFunctionReference,
} from './common/function-references';
import {
	isDereferenceExpression,
	parseDereferenceExpression,
	dereferencePointer,
} from './pointers';

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
		const functionRefFromBinding = captureFunctionReferenceFromBinding(binding, context);
		if (functionRefFromBinding !== undefined) {
			setLastFunctionReference(context, functionRefFromBinding);
			return ok(0);
		}
		if (binding.arrayValue !== undefined) {
			return ok(0);
		}
		if (binding.tupleValue !== undefined) {
			return ok(0);
		}
		if (binding.enumValue !== undefined) {
			return ok(binding.enumValue.memberIndex);
		}
		if (binding.value === undefined) {
			return err(`Variable '${name}' is not initialized`);
		}
		return ok(binding.value);
	}

	const def = getFunctionDefinition(name);
	if (def !== undefined) {
		setLastFunctionReference(context, captureFunctionReferenceByName(def.name, context));
		return ok(0);
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

	if (trimmed === 'this') {
		// Check if 'this' is a parameter name first (for method calls).
		const thisBinding = context.bindings.find((b): boolean => b.name === 'this');
		if (thisBinding === undefined) {
			// 'this' is a keyword that evaluates to 0 (for this.field syntax).
			return ok(0);
		}
		if (thisBinding.value === undefined) {
			return err("Variable 'this' is not initialized");
		}
		return ok(thisBinding.value);
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

function applyScopedMutationsToContext(
	outerContext: ExecutionContext,
	innerContext: ExecutionContext,
): void {
	// Block scoping rule: inner `let` bindings don’t leak;
	// only mutations to existing outer variables propagate.
	for (const outerBinding of outerContext.bindings) {
		const updated = innerContext.bindings.find(
			(binding): boolean => binding.name === outerBinding.name,
		);
		if (updated === undefined) {
			continue;
		}

		copyBindingValues(outerBinding, updated);
	}
}

function tryHandleReturnWithScopedMutations(
	trimmedRemaining: string,
	outerContext: ExecutionContext,
	innerContext: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> | undefined {
	try {
		const returnResult = handleReturnMarker(trimmedRemaining, innerContext, interpretInternal);
		if (returnResult !== undefined) {
			applyScopedMutationsToContext(outerContext, innerContext);
			return returnResult;
		}
		return undefined;
	} catch (error) {
		if (error instanceof ReturnSignal) {
			applyScopedMutationsToContext(outerContext, innerContext);
		}
		throw error;
	}
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

	const returnResult = tryHandleReturnWithScopedMutations(
		trimmedRemaining,
		context,
		newContext,
		interpretInternal,
	);
	if (returnResult !== undefined) {
		return returnResult;
	}

	const yieldResult = handleYieldMarker(trimmedRemaining, newContext, interpretInternal);
	if (yieldResult !== undefined) {
		if (yieldResult.type === 'ok') {
			applyScopedMutationsToContext(context, newContext);
		}
		return yieldResult;
	}

	if (trimmedRemaining.length === 0) {
		return err('Braced expression must contain an expression after variable declarations');
	}

	const valueResult = interpretInternal(trimmedRemaining, newContext);
	if (valueResult.type === 'ok') {
		applyScopedMutationsToContext(context, newContext);
	}
	return valueResult;
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

function tryParseDereference(
	literal: string,
	context: ExecutionContext,
): Result<number> | undefined {
	if (!isDereferenceExpression(literal)) {
		return undefined;
	}

	const pointerVarName = parseDereferenceExpression(literal);
	if (pointerVarName === undefined) {
		return err('Invalid dereference syntax');
	}

	const binding = context.bindings.find((b): boolean => b.name === pointerVarName);
	if (binding === undefined) {
		return err(`Variable '${pointerVarName}' is not defined`);
	}

	if (binding.pointerValue === undefined) {
		return err(`Variable '${pointerVarName}' is not a pointer`);
	}

	return dereferencePointer(binding.pointerValue, context);
}

function tryParseComplexExpressions(
	literal: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> | undefined {
	const callExprResult = tryParseCallExpression(literal, context, interpretInternal);
	if (callExprResult !== undefined) {
		return callExprResult;
	}

	const fieldAccessResult = tryParseFieldAccess(literal, context, interpretInternal);
	if (fieldAccessResult !== undefined) {
		return fieldAccessResult;
	}

	const dereferenceResult = tryParseDereference(literal, context);
	if (dereferenceResult !== undefined) {
		return dereferenceResult;
	}

	const enumMemberResult = tryParseEnumMemberAccess(literal);
	if (enumMemberResult !== undefined) {
		return enumMemberResult;
	}

	const indexResult = tryParseIndexing(literal, context, interpretInternal);
	if (indexResult !== undefined) {
		return indexResult;
	}

	const matchResult = parseMatchExpression(literal, context, interpretInternal);
	if (matchResult !== undefined) {
		return matchResult;
	}

	const ifElseResult = parseIfElseExpression(literal, context, interpretInternal);
	if (ifElseResult !== undefined) {
		return ifElseResult;
	}

	return undefined;
}

function tryParseBracketExpressions(
	trimmed: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
	processVariableBindings?: ProcessVariableBindingsFunction,
): Result<number> | undefined {
	if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
		if (isBalancedBrackets(trimmed)) {
			const inner = trimmed.substring(1, trimmed.length - 1);
			return interpretInternal(inner, context);
		}
	}

	if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
		return parseBracedExpression(trimmed, context, interpretInternal, processVariableBindings);
	}

	return undefined;
}

function tryParseReturnExpression(
	trimmed: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> | undefined {
	if (!trimmed.startsWith('return')) {
		return undefined;
	}
	if (trimmed === 'return') {
		return err('Return statement missing expression');
	}
	const after = trimmed.substring(6);
	if (!after.startsWith(' ') && !after.startsWith('\t')) {
		return undefined;
	}
	const expr = after.trim();
	if (expr.length === 0) {
		return err('Return statement missing expression');
	}

	const valueResult = interpretInternal(expr, context);
	if (valueResult.type === 'err') {
		return valueResult;
	}
	throw new ReturnSignal(valueResult.value);
}
export function parseLiteral(
	literal: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
	processVariableBindings?: ProcessVariableBindingsFunction,
): Result<number> {
	const complexResult = tryParseComplexExpressions(literal, context, interpretInternal);
	if (complexResult !== undefined) {
		return complexResult;
	}

	const trimmed = literal.trim();
	const returnExprResult = tryParseReturnExpression(trimmed, context, interpretInternal);
	if (returnExprResult !== undefined) {
		return returnExprResult;
	}

	const simpleLiteral = parseSimpleLiteral(trimmed, context);
	if (simpleLiteral !== undefined) {
		return simpleLiteral;
	}

	const bracketResult = tryParseBracketExpressions(
		trimmed,
		context,
		interpretInternal,
		processVariableBindings,
	);
	if (bracketResult !== undefined) {
		return bracketResult;
	}

	return parseNumberLiteral(trimmed);
}
