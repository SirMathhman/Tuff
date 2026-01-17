import { err, ok, type Result } from './common/result';
import { type ExecutionContext, isVariableName, validateValueForType } from './common/types';
import { getFunctionDefinition, type FunctionDefinition } from './functions';
import {
	createCallContext,
	extractFunctionCallExpression,
	findCallOpenParenIndex,
	splitArguments,
	ReturnSignal,
} from './function-call-utils';

interface InterpretFunction {
	(input: string, context: ExecutionContext): Result<number>;
}

interface MethodCallExpression {
	receiverExpr: string;
	methodName: string;
	args: string[];
}

function extractMethodCallExpression(literal: string): MethodCallExpression | undefined {
	const trimmed = literal.trim();
	const openIndex = findCallOpenParenIndex(trimmed);
	if (openIndex <= 0) {
		return undefined;
	}

	const beforeParen = trimmed.substring(0, openIndex).trim();
	const dotIndex = beforeParen.lastIndexOf('.');
	if (dotIndex <= 0) {
		return undefined;
	}

	const receiverExpr = beforeParen.substring(0, dotIndex).trim();
	const methodName = beforeParen.substring(dotIndex + 1).trim();
	if (receiverExpr.length === 0 || !isVariableName(methodName)) {
		return undefined;
	}

	const argsStr = trimmed.substring(openIndex + 1, trimmed.length - 1);
	const args = splitArguments(argsStr);
	return { receiverExpr, methodName, args };
}

function evaluateFunctionCallArgumentsWithPrefix(
	def: FunctionDefinition,
	prefixArgValues: number[],
	args: string[],
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number[]> {
	const values: number[] = [...prefixArgValues];
	for (let i = prefixArgValues.length; i < def.parameters.length; i++) {
		const argIndex = i - prefixArgValues.length;
		const argResult = interpretInternal(args[argIndex], context);
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

function evaluateFunctionCallArguments(
	def: FunctionDefinition,
	args: string[],
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number[]> {
	return evaluateFunctionCallArgumentsWithPrefix(def, [], args, context, interpretInternal);
}

function executeFunctionCall(
	def: FunctionDefinition,
	argValues: number[],
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> {
	const callContext = createCallContext(def, argValues, context);
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

	return executeFunctionCall(def, argValuesResult.value, context, interpretInternal);
}

function tryParseFunctionReferenceCall(
	literal: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> | undefined {
	const parsed = extractFunctionCallExpression(literal);
	if (parsed === undefined) {
		return undefined;
	}

	const varName = parsed.functionName;
	const binding = context.bindings.find((b): boolean => b.name === varName);
	if (binding?.functionReferenceValue === undefined) {
		return undefined;
	}

	const referencedFunctionName = binding.functionReferenceValue.functionName;
	const def = getFunctionDefinition(referencedFunctionName);
	if (def === undefined) {
		return err(`Function reference points to undefined function: ${referencedFunctionName}`);
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

	return executeFunctionCall(def, argValuesResult.value, context, interpretInternal);
}

function tryParseMethodCall(
	literal: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> | undefined {
	const parsed = extractMethodCallExpression(literal);
	if (parsed === undefined) {
		return undefined;
	}

	const def = getFunctionDefinition(parsed.methodName);
	if (def === undefined) {
		return err(`Undefined function: ${parsed.methodName}`);
	}

	if (def.parameters.length === 0 || def.parameters[0].name !== 'this') {
		return err(`Function '${def.name}' is not a method (first parameter must be 'this')`);
	}

	if (parsed.args.length !== def.parameters.length - 1) {
		return err(
			`Method '${def.name}' expects ${def.parameters.length - 1} argument(s), got ${parsed.args.length}`,
		);
	}

	const receiverResult = interpretInternal(parsed.receiverExpr, context);
	if (receiverResult.type === 'err') {
		return receiverResult;
	}

	const thisTypeCheck = validateValueForType(receiverResult.value, def.parameters[0].typeAnnotation);
	if (thisTypeCheck.type === 'err') {
		return thisTypeCheck;
	}

	const argValuesResult = evaluateFunctionCallArgumentsWithPrefix(
		def,
		[receiverResult.value],
		parsed.args,
		context,
		interpretInternal,
	);
	if (argValuesResult.type === 'err') {
		return argValuesResult;
	}

	return executeFunctionCall(def, argValuesResult.value, context, interpretInternal);
}

export function tryParseCallExpression(
	literal: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> | undefined {
	const methodCallResult = tryParseMethodCall(literal, context, interpretInternal);
	if (methodCallResult !== undefined) {
		return methodCallResult;
	}

	const functionRefResult = tryParseFunctionReferenceCall(literal, context, interpretInternal);
	if (functionRefResult !== undefined) {
		return functionRefResult;
	}

	return tryParseFunctionCall(literal, context, interpretInternal);
}
