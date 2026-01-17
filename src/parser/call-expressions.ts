import { err, ok, type Result } from '../common/result';
import {
	type ExecutionContext,
	isVariableName,
	validateValueForType,
	type VariableBinding,
	type FunctionReference,
} from '../common/types';
import {
	getFunctionDefinition,
	type FunctionDefinition,
	validateFunctionReference,
} from '../interpreter/functions';
import {
	createCallContext,
	extractFunctionCallExpression,
	findCallOpenParenIndex,
	splitArguments,
	ReturnSignal,
} from '../parser/function-call-utils';
import {
	clearLastFunctionReference,
	getLastFunctionReference,
	setLastFunctionReference,
} from '../common/function-references';
import { getLastStructInstance, setLastStructInstance } from '../common/struct-values';
import { getModule } from '../interpreter/modules';

interface InterpretFunction {
	(input: string, context: ExecutionContext): Result<number>;
}

interface MethodCallExpression {
	receiverExpr: string;
	methodName: string;
	args: string[];
}

interface ExpressionCallExpression {
	calleeExpr: string;
	args: string[];
}

function isFunctionTypeAnnotation(typeAnnotation: string): boolean {
	const trimmed = typeAnnotation.trim();
	return trimmed.startsWith('(') && trimmed.includes('=>');
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

function extractExpressionCallExpression(literal: string): ExpressionCallExpression | undefined {
	const trimmed = literal.trim();
	const openIndex = findCallOpenParenIndex(trimmed);
	if (openIndex <= 0) {
		return undefined;
	}

	const calleeExpr = trimmed.substring(0, openIndex).trim();
	if (calleeExpr.length === 0) {
		return undefined;
	}

	const argsStr = trimmed.substring(openIndex + 1, trimmed.length - 1);
	const args = splitArguments(argsStr);
	return { calleeExpr, args };
}

function interpretFunctionBody(
	def: FunctionDefinition,
	callContext: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> {
	try {
		return interpretInternal(def.bodyExpression, callContext);
	} catch (error) {
		if (!(error instanceof ReturnSignal)) {
			throw error;
		}
		if (isFunctionTypeAnnotation(def.returnType)) {
			return err(`Function '${def.name}' cannot return a function reference via 'return' yet`);
		}
		return validateValueForType(error.value, def.returnType);
	}
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
	capturedBindings?: VariableBinding[],
): Result<number> {
	const callContext = createCallContext(def, argValues, context, capturedBindings);
	const bodyResult = interpretFunctionBody(def, callContext, interpretInternal);
	if (bodyResult.type === 'err') {
		return bodyResult;
	}

	const structInstance = getLastStructInstance(callContext);
	if (structInstance !== undefined) {
		const isConstructor = def.name === def.returnType;
		// If it's a constructor or effectively a struct return, ensure type matches
		if (isConstructor) {
			structInstance.structType = def.returnType;
		}
		setLastStructInstance(context, structInstance);
	}

	if (isFunctionTypeAnnotation(def.returnType)) {
		const returnedRef = getLastFunctionReference(callContext);
		if (returnedRef === undefined) {
			return err(`Function '${def.name}' must return a function reference`);
		}

		const validationResult = validateFunctionReference(
			returnedRef.functionName,
			def.returnType,
			returnedRef.localDefinition,
		);
		if (validationResult.type === 'err') {
			return validationResult;
		}

		const capturedRef: FunctionReference = {
			functionName: returnedRef.functionName,
			capturedBindings: returnedRef.capturedBindings,
			localDefinition: returnedRef.localDefinition,
		};
		setLastFunctionReference(context, capturedRef);
		return ok(0);
	}

	return validateValueForType(bodyResult.value, def.returnType);
}

interface ResolvedFunctionDefinition {
	def: FunctionDefinition;
	capturedBindings?: VariableBinding[];
}

type ResolveFunctionDefinitionResult = Result<ResolvedFunctionDefinition> | undefined;
type ResolveFunctionDefinition = (functionName: string) => ResolveFunctionDefinitionResult;

function resolveDirectFunctionDefinition(functionName: string): Result<ResolvedFunctionDefinition> {
	// Check if it's a module::function call
	if (functionName.includes('::')) {
		const parts = functionName.split('::');
		if (parts.length !== 2) {
			return err(`Invalid module access: ${functionName}`);
		}

		const moduleName = parts[0].trim();
		const methodName = parts[1].trim();

		const moduleContext = getModule(moduleName);
		if (moduleContext === undefined) {
			return err(`Undefined module: ${moduleName}`);
		}

		const binding = moduleContext.bindings.find((b): boolean => b.name === methodName);
		if (binding?.functionReferenceValue === undefined) {
			return err(`Function '${methodName}' not found in module '${moduleName}'`);
		}

		const ref = binding.functionReferenceValue;
		const def = getFunctionDefinition(ref.functionName);
		if (def === undefined) {
			return err(`Function '${methodName}' in module '${moduleName}' is undefined`);
		}

		return ok({ def, capturedBindings: ref.capturedBindings });
	}

	// Regular function lookup
	const def = getFunctionDefinition(functionName);
	if (def === undefined) {
		return err(`Undefined function: ${functionName}`);
	}
	return ok({ def });
}

function resolveFunctionReferenceDefinition(
	varName: string,
	context: ExecutionContext,
): ResolveFunctionDefinitionResult {
	const binding = context.bindings.find((b): boolean => b.name === varName);
	if (binding?.functionReferenceValue === undefined) {
		return undefined;
	}

	const ref = binding.functionReferenceValue;

	// Use local definition if present (for inner/closure functions)
	if (ref.localDefinition !== undefined) {
		return ok({ def: ref.localDefinition, capturedBindings: ref.capturedBindings });
	}

	const def = getFunctionDefinition(ref.functionName);
	if (def === undefined) {
		return err(`Function reference points to undefined function: ${ref.functionName}`);
	}
	return ok({ def, capturedBindings: ref.capturedBindings });
}

function tryParseAndExecuteFunctionLikeCall(
	literal: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
	resolveDefinition: ResolveFunctionDefinition,
): Result<number> | undefined {
	const parsed = extractFunctionCallExpression(literal);
	if (parsed === undefined) {
		return undefined;
	}

	const defResult = resolveDefinition(parsed.functionName);
	if (defResult === undefined) {
		return undefined;
	}
	if (defResult.type === 'err') {
		return defResult;
	}
	const capturedBindings = defResult.value.capturedBindings;
	const functionDef = defResult.value.def;

	if (parsed.args.length !== functionDef.parameters.length) {
		return err(
			`Function '${functionDef.name}' expects ${functionDef.parameters.length} argument(s), got ${parsed.args.length}`,
		);
	}

	const argValuesResult = evaluateFunctionCallArguments(
		functionDef,
		parsed.args,
		context,
		interpretInternal,
	);
	if (argValuesResult.type === 'err') {
		return argValuesResult;
	}

	return executeFunctionCall(
		functionDef,
		argValuesResult.value,
		context,
		interpretInternal,
		capturedBindings,
	);
}

function tryParseFunctionCall(
	literal: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> | undefined {
	return tryParseAndExecuteFunctionLikeCall(
		literal,
		context,
		interpretInternal,
		resolveDirectFunctionDefinition,
	);
}

function tryParseFunctionReferenceCall(
	literal: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> | undefined {
	function resolveDefinition(functionName: string): ResolveFunctionDefinitionResult {
		return resolveFunctionReferenceDefinition(functionName, context);
	}

	return tryParseAndExecuteFunctionLikeCall(literal, context, interpretInternal, resolveDefinition);
}

function evaluateExpressionToFunctionReference(
	calleeExpr: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<FunctionReference> {
	clearLastFunctionReference(context);
	const calleeResult = interpretInternal(calleeExpr, context);
	if (calleeResult.type === 'err') {
		return calleeResult;
	}

	const ref = getLastFunctionReference(context);
	if (ref === undefined) {
		return err(`Expression '${calleeExpr}' did not evaluate to a function reference`);
	}
	clearLastFunctionReference(context);
	return ok(ref);
}

function executeFunctionReferenceCall(
	ref: FunctionReference,
	args: string[],
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> {
	// Use local definition if present (for inner/closure functions)
	const def = ref.localDefinition ?? getFunctionDefinition(ref.functionName);
	if (def === undefined) {
		return err(`Undefined function: ${ref.functionName}`);
	}

	if (args.length !== def.parameters.length) {
		return err(
			`Function '${def.name}' expects ${def.parameters.length} argument(s), got ${args.length}`,
		);
	}

	const argValuesResult = evaluateFunctionCallArguments(def, args, context, interpretInternal);
	if (argValuesResult.type === 'err') {
		return argValuesResult;
	}

	return executeFunctionCall(
		def,
		argValuesResult.value,
		context,
		interpretInternal,
		ref.capturedBindings,
	);
}

function tryParseExpressionResultCall(
	literal: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> | undefined {
	if (extractFunctionCallExpression(literal) !== undefined) {
		return undefined;
	}

	const parsed = extractExpressionCallExpression(literal);
	if (parsed === undefined) {
		return undefined;
	}

	const refResult = evaluateExpressionToFunctionReference(
		parsed.calleeExpr,
		context,
		interpretInternal,
	);
	if (refResult.type === 'err') {
		return refResult;
	}

	return executeFunctionReferenceCall(refResult.value, parsed.args, context, interpretInternal);
}

function isMethodDefinition(def: FunctionDefinition): boolean {
	return def.parameters.length > 0 && def.parameters[0].name === 'this';
}

function tryParseReadCall(literal: string, context: ExecutionContext): Result<number> | undefined {
	const trimmed = literal.trim();
	if (!trimmed.startsWith('read<') || !trimmed.endsWith('>()')) {
		return undefined;
	}

	const typeStart = 5; // length of 'read<'
	const typeEnd = trimmed.length - 3; // before '>()'
	const typeAnnotation = trimmed.substring(typeStart, typeEnd);
	if (typeAnnotation.length === 0) {
		return undefined;
	}

	if (!context.stdinTokens || context.stdinIndex === undefined) {
		return err('No stdin available for read call');
	}

	if (context.stdinIndex >= context.stdinTokens.length) {
		return err('Insufficient stdin tokens for read call');
	}

	const token = context.stdinTokens[context.stdinIndex];
	context.stdinIndex += 1;

	const value = parseInt(token, 10);
	if (isNaN(value)) {
		return err(`Invalid stdin value: '${token}' is not a number`);
	}

	return validateValueForType(value, typeAnnotation);
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
	if (def === undefined || !isMethodDefinition(def)) {
		return undefined;
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
	const readCallResult = tryParseReadCall(literal, context);
	if (readCallResult !== undefined) {
		return readCallResult;
	}

	const methodCallResult = tryParseMethodCall(literal, context, interpretInternal);
	if (methodCallResult !== undefined) {
		return methodCallResult;
	}

	const functionRefResult = tryParseFunctionReferenceCall(literal, context, interpretInternal);
	if (functionRefResult !== undefined) {
		return functionRefResult;
	}

	const functionCallResult = tryParseFunctionCall(literal, context, interpretInternal);
	if (functionCallResult !== undefined) {
		return functionCallResult;
	}

	return tryParseExpressionResultCall(literal, context, interpretInternal);
}
