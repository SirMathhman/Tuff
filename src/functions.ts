import { err, ok, type Result } from './common/result';
import {
	findClosingBrace,
	findClosingParen,
	findSemicolonOutsideBrackets,
	getTypeRangeMax,
	isVariableName,
	type ParsedBinding,
} from './common/types';
import { stripLeadingSemicolon } from './common/helpers';

/**
 * Represents a single function parameter.
 */
export interface FunctionParameter {
	name: string;
	typeAnnotation: string;
}

/**
 * Represents a function definition.
 */
export interface FunctionDefinition {
	name: string;
	parameters: FunctionParameter[];
	returnType: string;
	bodyExpression: string;
}

/**
 * Represents parsed return type and what comes after it.
 */
interface ReturnTypeParseResult {
	returnType: string;
	afterReturn: string;
}

interface AfterArrowParseResult {
	returnType: string;
	afterArrow: string;
}

/**
 * Represents parsed function body and remaining input.
 */
interface BodyExpressionParseResult {
	bodyExpression: string;
	remaining: string;
}

/**
 * Represents parsed function signature (name + params) and what comes after it.
 */
interface FunctionSignatureParseResult {
	name: string;
	parameters: FunctionParameter[];
	afterSignature: string;
}

/**
 * Represents a parsed function definition with remaining input.
 */
export interface ParsedFunctionDefinition {
	definition: FunctionDefinition;
	remaining: string;
}

/**
 * Global registry of function definitions.
 */
const functionRegistry: Map<string, FunctionDefinition> = new Map();

/**
 * Registers a function definition globally.
 */
export function registerFunctionDefinition(def: FunctionDefinition): Result<void> {
	if (functionRegistry.has(def.name)) {
		return err(`Function '${def.name}' is already defined`);
	}
	functionRegistry.set(def.name, def);
	return ok(undefined as void);
}

/**
 * Gets a function definition from registry.
 */
export function getFunctionDefinition(name: string): FunctionDefinition | undefined {
	return functionRegistry.get(name);
}

/**
 * Clears function registry (for testing).
 */
export function clearFunctionRegistry(): void {
	functionRegistry.clear();
}

/**
 * Checks if input starts with a function definition.
 */
export function isFunctionDefinition(input: string): boolean {
	return input.trim().startsWith('fn ');
}

function isKnownValueType(typeAnnotation: string): boolean {
	const max = getTypeRangeMax(typeAnnotation);
	return max !== 0;
}

function parseParameter(trimmed: string): Result<FunctionParameter> {
	const colonIndex = trimmed.indexOf(':');
	if (colonIndex < 0) {
		return err(`Invalid function parameter: ${trimmed}`);
	}

	const name = trimmed.substring(0, colonIndex).trim();
	const typeAnnotation = trimmed.substring(colonIndex + 1).trim();

	if (!isVariableName(name)) {
		return err(`Invalid parameter name: ${name}`);
	}

	if (typeAnnotation.length === 0) {
		return err(`Parameter '${name}' missing type`);
	}

	if (!isKnownValueType(typeAnnotation)) {
		return err(`Unknown type '${typeAnnotation}' for parameter '${name}'`);
	}

	return ok({ name, typeAnnotation });
}

function parseParameters(paramsStr: string): Result<FunctionParameter[]> {
	const trimmed = paramsStr.trim();
	if (trimmed.length === 0) {
		return ok([]);
	}

	const parts = trimmed.split(',');
	const parameters: FunctionParameter[] = [];
	const seenNames = new Set<string>();

	for (const part of parts) {
		const paramStr = part.trim();
		if (paramStr.length === 0) {
			continue;
		}

		const paramResult = parseParameter(paramStr);
		if (paramResult.type === 'err') {
			return paramResult;
		}

		if (seenNames.has(paramResult.value.name)) {
			return err(`Parameter '${paramResult.value.name}' is already defined`);
		}
		seenNames.add(paramResult.value.name);
		parameters.push(paramResult.value);
	}

	return ok(parameters);
}

function parseReturnType(afterParams: string): Result<ReturnTypeParseResult> {
	const trimmed = afterParams.trim();
	if (!trimmed.startsWith(':')) {
		return err('Function definition missing return type');
	}

	const afterColon = trimmed.substring(1).trim();
	const arrowIndex = afterColon.indexOf('=>');
	if (arrowIndex < 0) {
		return err('Function definition missing =>');
	}

	const returnType = afterColon.substring(0, arrowIndex).trim();
	const afterReturn = afterColon.substring(arrowIndex + 2).trim();

	if (returnType.length === 0) {
		return err('Function definition missing return type');
	}

	if (!isKnownValueType(returnType)) {
		return err(`Unknown return type '${returnType}'`);
	}

	return ok({ returnType, afterReturn });
}

function parseAfterSignature(afterParams: string): Result<AfterArrowParseResult> {
	const trimmed = afterParams.trim();
	if (trimmed.startsWith(':')) {
		const withReturn = parseReturnType(trimmed);
		if (withReturn.type === 'err') {
			return withReturn;
		}
		return ok({ returnType: withReturn.value.returnType, afterArrow: withReturn.value.afterReturn });
	}

	const arrowIndex = trimmed.indexOf('=>');
	if (arrowIndex < 0) {
		return err('Function definition missing =>');
	}

	const afterArrow = trimmed.substring(arrowIndex + 2).trim();
	// Default return type when omitted.
	return ok({ returnType: 'I32', afterArrow });
}

function parseBodyExpression(afterArrow: string): Result<BodyExpressionParseResult> {
	const trimmed = afterArrow.trim();
	if (trimmed.startsWith('{')) {
		const closingBraceIndex = findClosingBrace(trimmed);
		if (closingBraceIndex < 0) {
			return err('Function body missing closing brace');
		}

		const afterBrace = trimmed.substring(closingBraceIndex + 1);
		const semicolonIndex = findSemicolonOutsideBrackets(afterBrace);
		let expressionEndIndex = closingBraceIndex + 1;
		let remainingStartIndex = closingBraceIndex + 1;
		if (semicolonIndex >= 0) {
			expressionEndIndex += semicolonIndex;
			remainingStartIndex += semicolonIndex;
		}
		const bodyExpression = trimmed.substring(0, expressionEndIndex);
		const remaining = stripLeadingSemicolon(trimmed.substring(remainingStartIndex));

		return ok({ bodyExpression, remaining });
	}

	const semiIndex = findSemicolonOutsideBrackets(trimmed);
	if (semiIndex < 0) {
		return err('Function body missing semicolon');
	}

	const bodyExpression = trimmed.substring(0, semiIndex).trim();
	if (bodyExpression.length === 0) {
		return err('Function body missing expression');
	}

	const remaining = stripLeadingSemicolon(trimmed.substring(semiIndex));
	return ok({ bodyExpression, remaining });
}

function parseFunctionSignature(afterFn: string): Result<FunctionSignatureParseResult> {
	const openParenIndex = afterFn.indexOf('(');
	if (openParenIndex < 0) {
		return err('Function definition missing parameter list');
	}

	const name = afterFn.substring(0, openParenIndex).trim();
	if (!isVariableName(name)) {
		return err(`Invalid function name: ${name}`);
	}

	const afterName = afterFn.substring(openParenIndex);
	const closeParenIndex = findClosingParen(afterName);
	if (closeParenIndex < 0) {
		return err('Function definition missing closing parenthesis');
	}

	const paramsStr = afterName.substring(1, closeParenIndex);
	const paramsResult = parseParameters(paramsStr);
	if (paramsResult.type === 'err') {
		return paramsResult;
	}

	const afterSignature = afterName.substring(closeParenIndex + 1).trim();
	return ok({ name, parameters: paramsResult.value, afterSignature });
}

/**
 * Parses a function definition statement.
 */
export function parseFunctionDefinition(input: string): Result<ParsedFunctionDefinition> {
	const trimmed = input.trim();
	if (!trimmed.startsWith('fn ')) {
		return err('Not a function definition');
	}

	const afterFn = trimmed.substring(3).trim();
	const signatureResult = parseFunctionSignature(afterFn);
	if (signatureResult.type === 'err') {
		return signatureResult;
	}

	const afterSigResult = parseAfterSignature(signatureResult.value.afterSignature);
	if (afterSigResult.type === 'err') {
		return afterSigResult;
	}

	const bodyResult = parseBodyExpression(afterSigResult.value.afterArrow);
	if (bodyResult.type === 'err') {
		return bodyResult;
	}

	const def: FunctionDefinition = {
		name: signatureResult.value.name,
		parameters: signatureResult.value.parameters,
		returnType: afterSigResult.value.returnType,
		bodyExpression: bodyResult.value.bodyExpression,
	};

	return ok({ definition: def, remaining: bodyResult.value.remaining });
}

/**
 * Checks if a type annotation looks like a function type (e.g., "() => I32" or "(I32, I32) => I32").
 */
export function isFunctionType(typeAnnotation: string): boolean {
	const trimmed = typeAnnotation.trim();
	return trimmed.startsWith('(') && trimmed.includes('=>');
}

/**
 * Parses a function type annotation and extracts the return type.
 * Format: (ParamType1, ParamType2, ...) => ReturnType
 */
export function parseFunctionType(typeAnnotation: string): Result<string> {
	const trimmed = typeAnnotation.trim();
	const arrowIndex = trimmed.indexOf('=>');
	if (arrowIndex < 0) {
		return err('Invalid function type: missing arrow');
	}

	const returnType = trimmed.substring(arrowIndex + 2).trim();
	if (returnType.length === 0) {
		return err('Invalid function type: missing return type');
	}

	return ok(returnType);
}

/**
 * Validates that a function reference matches its type annotation.
 */
export function validateFunctionReference(
	functionName: string,
	typeAnnotation: string,
): Result<void> {
	const def = getFunctionDefinition(functionName);
	if (def === undefined) {
		return err(`Function '${functionName}' not defined`);
	}

	const expectedReturnTypeResult = parseFunctionType(typeAnnotation);
	if (expectedReturnTypeResult.type === 'err') {
		return expectedReturnTypeResult;
	}

	const expectedReturnType = expectedReturnTypeResult.value;
	if (def.returnType !== expectedReturnType) {
		return err(
			`Function '${functionName}' has return type ${def.returnType}, expected ${expectedReturnType}`,
		);
	}

	return ok(undefined as void);
}

/**
 * Parses a function type binding declaration.
 */
export function parseFunctionTypeBinding(
	varName: string,
	isMutable: boolean,
	typeAnnotation: string,
	valueStr: string,
	remaining: string,
): Result<ParsedBinding> {
	const trimmedValueStr = valueStr.trim();
	if (!isVariableName(trimmedValueStr)) {
		return err('Function reference value must be a variable name (function name)');
	}

	const validationResult = validateFunctionReference(trimmedValueStr, typeAnnotation);
	if (validationResult.type === 'err') {
		return validationResult;
	}

	return ok({
		name: varName,
		value: undefined,
		isMutable,
		remaining,
		functionReferenceValue: {
			functionName: trimmedValueStr,
		},
	});
}
