/* eslint-disable max-lines */
import { err, ok, type Result } from './common/result';
import {
	type ContextAndRemaining,
	type DestructuredFields,
	type ExecutionContext,
	type FunctionReference,
	findClosingBrace,
	findSemicolonOutsideBrackets,
	isAssignmentStatement,
	isBalancedBrackets,
	isWhileStatement,
	isYieldStatement,
	isVariableName,
	shouldProcessAsStatementBlock,
	type StructInstance,
	validateValueForType,
	type ParsedBinding,
	type ProcessedBindings,
	type VariableBinding,
} from './common/types';
import {
	extractIfConditionAndAfter,
	extractIfStatementBranches,
	extractRemainingFromStatement,
	parseVariableDeclarationHeader,
	isIfStatement,
	stripLeadingSemicolon,
} from './common/helpers';
import { interpretInternal } from './evaluator';
import { parseAssignment } from './assignments';
import { processWhileStatement, processForStatement, isForStatement } from './loops';
import {
	isStructDefinition,
	parseStructDefinition,
	registerStructDefinition,
	isStructType,
	handleStructInstantiation,
	handleStructDestructuring,
} from './structs';
import {
	isFunctionDefinition,
	parseFunctionDefinition,
	registerFunctionDefinition,
	getFunctionDefinition,
	isFunctionType,
	parseFunctionTypeBinding,
	type FunctionDefinition,
} from './functions';
import {
	captureFunctionReferenceByName,
	clearLastFunctionReference,
	getLastFunctionReference,
} from './common/function-references';
import { clearLastStructInstance, getLastStructInstance } from './common/struct-values';
import { parseArrayTypeBinding, parseArrayType } from './arrays';
import { parseTupleTypeBinding } from './tuples';
import {
	isEnumType,
	parseEnumDefinition,
	registerEnumDefinition,
	parseEnumTypeBinding,
	isEnumDefinition,
} from './enums';
import { isPointerType, parsePointerTypeBinding, parsePointerAssignment } from './pointers';

function parseStructTypeBinding(
	varName: string,
	isMutable: boolean,
	typeAnnotation: string,
	valueStr: string,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> {
	const res = handleStructInstantiation(varName, isMutable, valueStr, remaining, context);
	if (res === undefined) {
		return err(`Expected ${typeAnnotation} instantiation`);
	}
	if (res.type === 'ok' && res.value.structValue?.structType !== typeAnnotation) {
		return err(`Type mismatch: expected ${typeAnnotation}, got ${res.value.structValue?.structType}`);
	}
	return res;
}
function tryParseImplicitStructBinding(
	varName: string,
	isMutable: boolean,
	valueStr: string,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> | undefined {
	return handleStructInstantiation(varName, isMutable, valueStr, remaining, context);
}
function handleUninitializedDeclaration(
	varName: string,
	isMutable: boolean,
	withoutLet: string,
): Result<ParsedBinding> {
	const remainingResult = extractRemainingAfterSemicolon(
		withoutLet,
		'Variable declaration missing semicolon',
	);
	if (remainingResult.type === 'err') {
		return remainingResult;
	}
	return ok({ name: varName, value: undefined, isMutable, remaining: remainingResult.value });
}

function extractRemainingAfterSemicolon(input: string, errorMessage: string): Result<string> {
	const semiIndex = findSemicolonOutsideBrackets(input);
	if (semiIndex < 0) {
		return err(errorMessage);
	}
	return ok(input.substring(semiIndex + 1).trim());
}

/**
 * Handles processing variable binding with value and semicolon.
 */
/**
 * Parses This type binding (let temp : This = this).
 */
function parseThisTypeBinding(
	varName: string,
	isMutable: boolean,
	valueStr: string,
	remaining: string,
): Result<ParsedBinding> {
	if (valueStr.trim() !== 'this') {
		return err('This type can only be assigned from this');
	}
	return ok({ name: varName, value: 0, isMutable, remaining, thisValue: true });
}

/**
 * Parses constructor call arguments from value string.
 */
function parseConstructorCallArgs(
	valueStr: string,
	typeAnnotation: string,
	expectedArgCount: number,
): Result<string[]> {
	const trimmedValue = valueStr.trim();
	const openParenIndex = trimmedValue.indexOf('(');
	const closeParenIndex = trimmedValue.lastIndexOf(')');

	if (openParenIndex < 0 || closeParenIndex < 0) {
		return err('Invalid constructor call');
	}

	const argsStr = trimmedValue.substring(openParenIndex + 1, closeParenIndex).trim();
	const args: string[] = [];
	if (argsStr.length > 0) {
		args.push(...argsStr.split(','));
	}

	if (args.length !== expectedArgCount) {
		return err(
			`Constructor '${typeAnnotation}' expects ${expectedArgCount} arguments, got ${args.length}`,
		);
	}

	return ok(args);
}

/**
 * Represents a parameter with a name (simplified for constructor arg evaluation).
 */
interface ParameterWithName {
	name: string;
}

/**
 * Evaluates constructor arguments and builds field map.
 */
function evaluateConstructorArgs(
	args: string[],
	parameters: ParameterWithName[],
	context: ExecutionContext,
): Result<Map<string, number>> {
	const fieldValues = new Map<string, number>();
	for (let i = 0; i < parameters.length; i++) {
		const argResult = interpretInternal(args[i].trim(), context);
		if (argResult.type === 'err') {
			return argResult;
		}
		fieldValues.set(parameters[i].name, argResult.value);
	}
	return ok(fieldValues);
}

/**
 * Attempts to parse constructor type binding (e.g., let p : Point = Point(3, 4)).
 */
function tryParseConstructorTypeBinding(
	varName: string,
	isMutable: boolean,
	typeAnnotation: string,
	valueStr: string,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> | undefined {
	const def = getFunctionDefinition(typeAnnotation);
	if (def === undefined || def.returnType !== def.name) {
		return undefined;
	}

	if (def.bodyExpression.trim() !== 'this') {
		return undefined;
	}

	const callResult = interpretInternal(valueStr, context);
	if (callResult.type === 'err') {
		return callResult;
	}

	const argsResult = parseConstructorCallArgs(valueStr, typeAnnotation, def.parameters.length);
	if (argsResult.type === 'err') {
		return argsResult;
	}

	const fieldValuesResult = evaluateConstructorArgs(argsResult.value, def.parameters, context);
	if (fieldValuesResult.type === 'err') {
		return fieldValuesResult;
	}

	return ok({
		name: varName,
		value: 0,
		isMutable,
		remaining,
		structValue: {
			structType: typeAnnotation,
			values: fieldValuesResult.value,
		},
	});
}

/**
 * Attempts to parse value binding with a specific type annotation.
 */
function tryTypeSpecificValueBinding(
	varName: string,
	isMutable: boolean,
	typeAnnotation: string,
	valueStr: string,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> | undefined {
	if (typeAnnotation === 'This') {
		return parseThisTypeBinding(varName, isMutable, valueStr, remaining);
	}
	if (typeAnnotation.startsWith('[')) {
		return parseArrayTypeBinding(varName, isMutable, typeAnnotation, valueStr, remaining, context);
	}
	if (typeAnnotation.startsWith('(') && isFunctionType(typeAnnotation)) {
		return parseFunctionTypeBinding(varName, isMutable, typeAnnotation, valueStr, remaining);
	}
	if (typeAnnotation.startsWith('(')) {
		return parseTupleTypeBinding(varName, isMutable, typeAnnotation, valueStr, remaining, context);
	}
	if (isPointerType(typeAnnotation)) {
		return parsePointerTypeBinding(varName, isMutable, typeAnnotation, valueStr, remaining, context);
	}
	if (isEnumType(typeAnnotation)) {
		return parseEnumTypeBinding(varName, isMutable, typeAnnotation, valueStr, remaining);
	}
	if (isStructType(typeAnnotation)) {
		return parseStructTypeBinding(varName, isMutable, typeAnnotation, valueStr, remaining, context);
	}
	if (isVariableName(typeAnnotation)) {
		const constructorResult = tryParseConstructorTypeBinding(
			varName,
			isMutable,
			typeAnnotation,
			valueStr,
			remaining,
			context,
		);
		if (constructorResult !== undefined) {
			return constructorResult;
		}
	}
	return undefined;
}

interface ValueBindingParts {
	valueStr: string;
	remaining: string;
}

function extractValueBindingParts(afterTypeOrName: string): Result<ValueBindingParts> {
	const withoutEqual = afterTypeOrName.substring(1).trim();
	const semiIndex = findSemicolonOutsideBrackets(withoutEqual);
	if (semiIndex < 0) {
		return err('Variable declaration missing semicolon');
	}
	const valueStr = withoutEqual.substring(0, semiIndex).trim();
	const remaining = withoutEqual.substring(semiIndex + 1).trim();
	return ok({ valueStr, remaining });
}

interface CapturedSideChannels {
	structValue: StructInstance | undefined;
	functionRef: FunctionReference | undefined;
}

function captureAndClearSideChannels(context: ExecutionContext): CapturedSideChannels {
	const structValue = getLastStructInstance(context);
	clearLastStructInstance(context);
	const functionRef = getLastFunctionReference(context);
	clearLastFunctionReference(context);
	return { structValue, functionRef };
}

function evaluateValueExpression(
	valueStr: string,
	varName: string,
	isMutable: boolean,
	remaining: string,
	typeAnnotation: string | undefined,
	context: ExecutionContext,
): Result<ParsedBinding> | undefined {
	const valueResult = interpretInternal(valueStr, context);
	if (valueResult.type === 'err' && typeAnnotation === undefined) {
		return tryParseImplicitStructBinding(varName, isMutable, valueStr, remaining, context);
	}
	if (valueResult.type === 'err') {
		return valueResult;
	}
	return undefined;
}

function createBindingFromValue(
	varName: string,
	isMutable: boolean,
	remaining: string,
	value: number,
	typeAnnotation: string | undefined,
	context: ExecutionContext,
): Result<ParsedBinding> {
	const { structValue, functionRef } = captureAndClearSideChannels(context);

	if (typeAnnotation !== undefined) {
		const typeValidation = validateValueForType(value, typeAnnotation);
		if (typeValidation.type === 'err') {
			return typeValidation;
		}
	}
	return ok({
		name: varName,
		value,
		isMutable,
		remaining,
		structValue,
		functionReferenceValue: functionRef,
	});
}

function tryHandleTypeSpecificBinding(
	varName: string,
	isMutable: boolean,
	typeAnnotation: string | undefined,
	valueStr: string,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> | undefined {
	if (typeAnnotation === undefined) {
		return undefined;
	}
	return tryTypeSpecificValueBinding(
		varName,
		isMutable,
		typeAnnotation,
		valueStr,
		remaining,
		context,
	);
}

function evaluateAndCreateBinding(
	varName: string,
	isMutable: boolean,
	typeAnnotation: string | undefined,
	valueStr: string,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> {
	const earlyResult = evaluateValueExpression(
		valueStr,
		varName,
		isMutable,
		remaining,
		typeAnnotation,
		context,
	);
	if (earlyResult !== undefined) {
		return earlyResult;
	}

	const valueResult = interpretInternal(valueStr, context);
	if (valueResult.type === 'err') {
		return valueResult;
	}

	return createBindingFromValue(
		varName,
		isMutable,
		remaining,
		valueResult.value,
		typeAnnotation,
		context,
	);
}

function handleValueBinding(
	varName: string,
	isMutable: boolean,
	typeAnnotation: string | undefined,
	afterTypeOrName: string,
	context: ExecutionContext,
): Result<ParsedBinding> {
	const partsResult = extractValueBindingParts(afterTypeOrName);
	if (partsResult.type === 'err') {
		return partsResult;
	}
	const { valueStr, remaining } = partsResult.value;

	const initValidation = validateInitializerExpression(valueStr);
	if (initValidation.type === 'err') {
		return initValidation;
	}
	const typeResult = tryHandleTypeSpecificBinding(
		varName,
		isMutable,
		typeAnnotation,
		valueStr,
		remaining,
		context,
	);
	if (typeResult !== undefined) {
		return typeResult;
	}

	return evaluateAndCreateBinding(varName, isMutable, typeAnnotation, valueStr, remaining, context);
}

function validateInitializerExpression(valueStr: string): Result<void> {
	if (!isAssignmentStatement(valueStr)) {
		return ok(undefined as void);
	}

	const isBracedExpression =
		valueStr.startsWith('{') && valueStr.endsWith('}') && isBalancedBrackets(valueStr);
	if (isBracedExpression) {
		return ok(undefined as void);
	}

	return err('Assignment not allowed in variable initializer');
}

/**
 * Handles uninitialized array declaration.
 */
function handleUninitializedArrayDeclaration(
	varName: string,
	isMutable: boolean,
	typeAnnotation: string,
	withoutLet: string,
): Result<ParsedBinding> {
	const remainingResult = extractRemainingAfterSemicolon(
		withoutLet,
		'Variable declaration missing semicolon',
	);
	if (remainingResult.type === 'err') {
		return remainingResult;
	}

	const typeResult = parseArrayType(typeAnnotation);
	if (typeResult.type === 'err') {
		return typeResult;
	}
	const arrayType = typeResult.value;

	return ok({
		name: varName,
		value: undefined,
		isMutable,
		remaining: remainingResult.value,
		arrayValue: {
			elementType: arrayType.elementType,
			elements: [],
			initializedCount: arrayType.initializedCount,
			totalCapacity: arrayType.totalCapacity,
		},
	});
}

/**
 * Handles uninitialized tuple declaration.
 */
function handleUninitializedTupleDeclaration(
	varName: string,
	isMutable: boolean,
	typeAnnotation: string,
	withoutLet: string,
	context: ExecutionContext,
): Result<ParsedBinding> {
	const remainingResult = extractRemainingAfterSemicolon(
		withoutLet,
		'Variable declaration missing semicolon',
	);
	if (remainingResult.type === 'err') {
		return remainingResult;
	}
	return parseTupleTypeBinding(
		varName,
		isMutable,
		typeAnnotation,
		'',
		remainingResult.value,
		context,
	);
}

/**
 * Parses a destructuring declaration (e.g., let { x, y } = myPoint;).
 */
function parseDestructuringDeclaration(
	input: string,
	context: ExecutionContext,
): Result<ParsedBinding> {
	const trimmed = input.trim();

	// Find the closing brace of the destructuring pattern
	const closingBraceIndex = findClosingBrace(trimmed);
	if (closingBraceIndex < 0) {
		return err('Mismatched braces in destructuring pattern');
	}

	const pattern = trimmed.substring(0, closingBraceIndex + 1);
	const afterPattern = trimmed.substring(closingBraceIndex + 1).trim();

	// Check for mut keyword before the pattern (not applicable for destructuring)
	// and check for assignment

	if (!afterPattern.startsWith('=')) {
		return err('Destructuring pattern must be followed by assignment (=)');
	}

	const isMutable = false; // Destructuring doesn't support mut keyword on the pattern
	const valueAndRemaining = afterPattern.substring(1).trim();

	const semiIndex = findSemicolonOutsideBrackets(valueAndRemaining);
	if (semiIndex < 0) {
		return err('Destructuring assignment missing semicolon');
	}

	const valueStr = valueAndRemaining.substring(0, semiIndex).trim();
	const remaining = valueAndRemaining.substring(semiIndex + 1).trim();

	// Import and use the destructuring handler from structs
	const destructuringResult = handleStructDestructuring(
		pattern,
		isMutable,
		valueStr,
		remaining,
		context,
	);
	return destructuringResult;
}

/**
 * Parses a variable binding declaration.
 */
function parseVariableBinding(input: string, context: ExecutionContext): Result<ParsedBinding> {
	const trimmed = input.trim();
	if (!trimmed.startsWith('let ')) {
		return err('Expected variable declaration');
	}

	const withoutLet = trimmed.substring(4).trim();

	// Check if this is a destructuring pattern (starts with {)
	if (withoutLet.trim().startsWith('{')) {
		return parseDestructuringDeclaration(withoutLet, context);
	}

	const headerResult = parseVariableDeclarationHeader(withoutLet);
	if (headerResult.type === 'err') {
		return headerResult;
	}

	const { varName, isMutable, typeAnnotation, afterTypeOrName } = headerResult.value;

	if (afterTypeOrName.length > 0) {
		return handleValueBinding(varName, isMutable, typeAnnotation, afterTypeOrName, context);
	}

	if (typeAnnotation === undefined) {
		return handleUninitializedDeclaration(varName, isMutable, withoutLet);
	}

	if (typeAnnotation.startsWith('[')) {
		return handleUninitializedArrayDeclaration(varName, isMutable, typeAnnotation, withoutLet);
	}

	if (typeAnnotation.startsWith('(')) {
		return handleUninitializedTupleDeclaration(
			varName,
			isMutable,
			typeAnnotation,
			withoutLet,
			context,
		);
	}

	return handleUninitializedDeclaration(varName, isMutable, withoutLet);
}
/**
 * Processes a let declaration statement.
 */
/**
 * Handle destructured field bindings for struct destructuring.
 */
function handleDestructuredFields(
	destructuredFields: DestructuredFields,
	context: ExecutionContext,
	remaining: string,
): Result<ContextAndRemaining> {
	const newBindings: VariableBinding[] = [];

	for (const fieldName of destructuredFields.fields) {
		const fieldValue = destructuredFields.structValue.values.get(fieldName);
		if (fieldValue === undefined) {
			return err(`Field '${fieldName}' not found in destructured struct`);
		}

		newBindings.push({
			name: fieldName,
			value: fieldValue,
			isMutable: false,
		});
	}

	const newContext = {
		bindings: [...context.bindings, ...newBindings],
	};
	return ok({ context: newContext, remaining });
}

/**
 * Create a variable binding from parsed binding data.
 */
function createVariableBinding(parsed: ParsedBinding): VariableBinding {
	const binding: VariableBinding = {
		name: parsed.name,
		value: parsed.value,
		isMutable: parsed.isMutable,
	};
	if (parsed.structValue !== undefined) {
		binding.structValue = parsed.structValue;
	}
	if (parsed.arrayValue !== undefined) {
		binding.arrayValue = parsed.arrayValue;
	}
	if (parsed.tupleValue !== undefined) {
		binding.tupleValue = parsed.tupleValue;
	}
	if (parsed.enumValue !== undefined) {
		binding.enumValue = parsed.enumValue;
	}
	if (parsed.pointerValue !== undefined) {
		binding.pointerValue = parsed.pointerValue;
	}
	if (parsed.functionReferenceValue !== undefined) {
		binding.functionReferenceValue = parsed.functionReferenceValue;
	}
	if (parsed.thisValue !== undefined) {
		binding.thisValue = parsed.thisValue;
	}
	return binding;
}

function processLetDeclaration(
	input: string,
	context: ExecutionContext,
): Result<ContextAndRemaining> {
	const bindResult = parseVariableBinding(input, context);
	if (bindResult.type === 'err') {
		return bindResult;
	}

	const parsed = bindResult.value;

	// Handle struct destructuring
	if (parsed.destructuredFields !== undefined) {
		return handleDestructuredFields(parsed.destructuredFields, context, parsed.remaining);
	}

	if (context.bindings.some((binding): boolean => binding.name === parsed.name)) {
		return err(`Variable '${parsed.name}' is already defined`);
	}

	const newBinding = createVariableBinding(parsed);
	const newContext = {
		bindings: [...context.bindings, newBinding],
	};
	return ok({ context: newContext, remaining: parsed.remaining });
}

/**
 * Handles pointer assignment through dereference.
 */
function handlePointerAssignment(
	input: string,
	context: ExecutionContext,
): Result<ContextAndRemaining> | undefined {
	const pointerAssign = parsePointerAssignment(input, context);
	if (pointerAssign === undefined) {
		return undefined;
	}

	const pointerBinding = context.bindings.find(
		(b): boolean => b.name === pointerAssign.pointerVarName,
	);
	if (!pointerBinding?.pointerValue) {
		return err('Invalid pointer assignment');
	}
	if (!pointerBinding.pointerValue.isMutable) {
		return err('Cannot assign through immutable pointer');
	}
	const pointsToName = pointerBinding.pointerValue.pointsToName;
	const updatedBindings = context.bindings.map((binding): VariableBinding => {
		if (binding.name === pointsToName) {
			return { ...binding, value: pointerAssign.newValue };
		}
		return binding;
	});
	const newContext = { bindings: updatedBindings };
	return ok({ context: newContext, remaining: pointerAssign.remaining });
}

/**
 * Handles simple variable or array element assignment.
 */
function handleVariableAssignment(
	input: string,
	context: ExecutionContext,
): Result<ContextAndRemaining> {
	const assignResult = parseAssignment(input, context);
	if (assignResult.type === 'err') {
		return assignResult;
	}
	const { name, value, structValue, arrayAssignmentUpdatedBindings, remaining } = assignResult.value;

	// Handle array element assignment
	if (arrayAssignmentUpdatedBindings !== undefined) {
		const newContext = { bindings: arrayAssignmentUpdatedBindings };
		return ok({ context: newContext, remaining });
	}

	const updatedBindings = context.bindings.map((binding): VariableBinding => {
		if (binding.name === name) {
			const updated: VariableBinding = { name, value, isMutable: binding.isMutable };
			if (structValue !== undefined) {
				updated.structValue = structValue;
			}
			return updated;
		}
		return binding;
	});

	const newContext = { bindings: updatedBindings };
	return ok({ context: newContext, remaining });
}

/**
 * Processes an assignment statement (variable, array, or pointer).
 */
function processAssignmentStatement(
	input: string,
	context: ExecutionContext,
): Result<ContextAndRemaining> {
	const pointerResult = handlePointerAssignment(input, context);
	if (pointerResult !== undefined) {
		return pointerResult;
	}

	return handleVariableAssignment(input, context);
}
function processYieldInBlock(
	innerRemaining: string,
	afterBlock: string,
): ContextAndRemaining | undefined {
	if (!innerRemaining.startsWith('__YIELD__:')) {
		return undefined;
	}

	const afterYield = innerRemaining.substring(10); // Remove __YIELD__:
	const endMarkerIndex = afterYield.indexOf(':__');
	if (endMarkerIndex < 0) {
		return undefined;
	}

	let afterYieldFull: string;
	if (afterBlock.length > 0) {
		afterYieldFull = `${afterYield} ${afterBlock}`.trim();
	} else {
		afterYieldFull = afterYield.trim();
	}
	return { context: { bindings: [] }, remaining: afterYieldFull };
}
/**
 * Creates a scoped context that only propagates mutations to outer-scope variables.
 */
function createScopedContext(
	outerContext: ExecutionContext,
	innerContext: ExecutionContext,
): ExecutionContext {
	return {
		bindings: outerContext.bindings.map((outerBinding): VariableBinding => {
			const updated = innerContext.bindings.find(
				(binding): boolean => binding.name === outerBinding.name,
			);
			return updated ?? outerBinding;
		}),
	};
}
/**
 * Processes a braced block statement.
 */
function processBracedBlock(input: string, context: ExecutionContext): Result<ContextAndRemaining> {
	const trimmed = input.trim();
	if (!trimmed.startsWith('{')) {
		return err('Not a braced block');
	}

	const closingBraceIndex = findClosingBrace(trimmed);
	if (closingBraceIndex === -1) {
		return err('Unbalanced braces');
	}

	const blockContent = trimmed.substring(0, closingBraceIndex + 1);
	if (!isBalancedBrackets(blockContent)) {
		return err('Unbalanced brackets');
	}
	let afterBlock = trimmed.substring(closingBraceIndex + 1).trim();

	if (afterBlock.startsWith(';')) {
		afterBlock = afterBlock.substring(1).trim();
	}

	const inner = blockContent.substring(1, blockContent.length - 1);
	const bindingsResult = processVariableBindings(inner, context);
	if (bindingsResult.type === 'err') {
		return bindingsResult;
	}
	const { context: newContext, remaining: innerRemaining } = bindingsResult.value;

	// Check if yield was encountered - just pass it through for the parser to handle
	const yieldResult = processYieldInBlock(innerRemaining, afterBlock);
	if (yieldResult !== undefined) {
		return ok({ context: newContext, remaining: yieldResult.remaining });
	}

	const scopedContext = createScopedContext(context, newContext);
	let remaining: string;
	if (innerRemaining.trim().length > 0) {
		remaining = `${innerRemaining.trim()} ${afterBlock}`.trim();
	} else {
		remaining = afterBlock;
	}
	return ok({ context: scopedContext, remaining });
}

function processYieldStatement(
	input: string,
	context: ExecutionContext,
): Result<ContextAndRemaining> {
	const trimmed = input.trim();
	if (!trimmed.startsWith('yield ')) {
		return err('Not a yield statement');
	}

	const afterYield = trimmed.substring(6).trim();
	const semiIndex = findSemicolonOutsideBrackets(afterYield);
	if (semiIndex < 0) {
		return err('Yield statement missing semicolon');
	}

	const expressionStr = afterYield.substring(0, semiIndex).trim();

	// Return a marker to signal that yield was encountered
	// The expression string is used as the "remaining" to be evaluated
	const yieldMarker = `__YIELD__:${expressionStr}:__`;
	return ok({ context, remaining: yieldMarker });
}
function processReturnStatement(
	input: string,
	context: ExecutionContext,
): Result<ContextAndRemaining> {
	const trimmed = input.trim();
	if (!trimmed.startsWith('return ')) {
		return err('Not a return statement');
	}

	const afterReturn = trimmed.substring(7).trim();
	const semiIndex = findSemicolonOutsideBrackets(afterReturn);
	if (semiIndex < 0) {
		return err('Return statement missing semicolon');
	}

	const expressionStr = afterReturn.substring(0, semiIndex).trim();
	if (expressionStr.length === 0) {
		return err('Return statement missing expression');
	}

	const returnMarker = `__RETURN__:${expressionStr}:__`;
	return ok({ context, remaining: returnMarker });
}

/**
 * Processes an enum definition statement.
 */
function processEnumStatement(input: string, shouldRegister = true): Result<ContextAndRemaining> {
	const trimmed = input.trim();
	const closingBraceIndex = findClosingBrace(trimmed);
	if (closingBraceIndex < 0) {
		return err('Enum definition missing closing brace');
	}

	const definitionStr = trimmed.substring(0, closingBraceIndex + 1);
	const remaining = stripLeadingSemicolon(trimmed.substring(closingBraceIndex + 1));

	const defResult = parseEnumDefinition(definitionStr);
	if (defResult.type === 'err') {
		return defResult;
	}
	if (shouldRegister) {
		if (isEnumType(defResult.value.name)) {
			return err(`Enum '${defResult.value.name}' is already defined`);
		}
		registerEnumDefinition(defResult.value.name, defResult.value.members);
	}
	return ok({ context: { bindings: [] }, remaining });
}
function processStructStatement(input: string, shouldRegister = true): Result<ContextAndRemaining> {
	const trimmed = input.trim();
	const closingBraceIndex = findClosingBrace(trimmed);
	if (closingBraceIndex < 0) {
		return err('Struct definition missing closing brace');
	}
	const definitionStr = trimmed.substring(0, closingBraceIndex + 1);
	const remaining = stripLeadingSemicolon(trimmed.substring(closingBraceIndex + 1));

	const defResult = parseStructDefinition(definitionStr);
	if (defResult.type === 'err') {
		return defResult;
	}

	if (shouldRegister) {
		if (isStructType(defResult.value.name)) {
			return err(`Struct '${defResult.value.name}' is already defined`);
		}

		registerStructDefinition(defResult.value);
	}
	return ok({ context: { bindings: [] }, remaining });
}

/**
 * Processes a function definition statement.
 * @param input The full input starting with a function definition.
 * @param context The current execution context.
 * @param registerGlobally If false, the function is only added as a local binding (for inner functions).
 * @returns The updated context and remaining input after the definition.
 */
function processFunctionStatement(
	input: string,
	context: ExecutionContext,
	registerGlobally: boolean,
): Result<ContextAndRemaining> {
	const parsed = parseFunctionDefinition(input);
	if (parsed.type === 'err') {
		return parsed;
	}

	if (registerGlobally) {
		const registerResult = registerFunctionDefinition(parsed.value.definition);
		if (registerResult.type === 'err') {
			return registerResult;
		}
	}

	let localDefinition: FunctionDefinition | undefined = parsed.value.definition;
	if (registerGlobally) {
		localDefinition = undefined;
	}

	// Create a local binding for the function so it can be captured by closures/this.
	// This unifies function definitions with variable bindings for first-class functions.
	const refBinding: VariableBinding = {
		name: parsed.value.definition.name,
		value: 0,
		isMutable: false,
		functionReferenceValue: captureFunctionReferenceByName(
			parsed.value.definition.name,
			context,
			localDefinition,
		),
	};

	const newContext = {
		bindings: [...context.bindings, refBinding],
	};

	return ok({ context: newContext, remaining: parsed.value.remaining });
}
/**
 * Processes statements (declarations, assignments, if-else, blocks) in input.
 * @param input The input containing one or more statements.
 * @param context The current execution context.
 * @param allowBlocks If true, braced statement blocks are treated as statements.
 * @param registerGlobally If true, functions and structs are registered globally.
 * @returns The updated context and remaining input after processing statements.
 */
export function processStatements(
	input: string,
	context: ExecutionContext,
	allowBlocks: boolean,
	registerGlobally = false,
): Result<ContextAndRemaining> {
	let currentContext = context;
	let remaining = input;
	while (remaining.trim().length > 0) {
		const trimmed = remaining.trim();
		let result: Result<ContextAndRemaining> | undefined;
		if (isEnumDefinition(trimmed)) {
			result = processEnumStatement(remaining, registerGlobally);
		} else if (isStructDefinition(trimmed)) {
			result = processStructStatement(remaining, registerGlobally);
		} else if (isFunctionDefinition(trimmed)) {
			result = processFunctionStatement(remaining, currentContext, registerGlobally);
		} else if (trimmed.startsWith('let ')) {
			result = processLetDeclaration(remaining, currentContext);
		} else if (allowBlocks && shouldProcessAsStatementBlock(trimmed)) {
			result = processBracedBlock(remaining, currentContext);
		} else if (isYieldStatement(trimmed)) {
			result = processYieldStatement(remaining, currentContext);
		} else if (trimmed.startsWith('return ')) {
			result = processReturnStatement(remaining, currentContext);
		} else if (isIfStatement(trimmed)) {
			result = processIfStatement(remaining, currentContext);
		} else if (isForStatement(trimmed)) {
			result = processForStatement(remaining, currentContext, processStatements);
		} else if (isWhileStatement(trimmed)) {
			result = processWhileStatement(remaining, currentContext, processStatements);
		} else if (isAssignmentStatement(trimmed)) {
			result = processAssignmentStatement(remaining, currentContext);
		} else {
			break;
		}
		if (result.type === 'err') {
			return result;
		}
		// For global definitions, don't update context (they are global)
		if (!(isStructDefinition(trimmed) || isEnumDefinition(trimmed))) {
			currentContext = result.value.context;
		}
		remaining = result.value.remaining;
	}

	return ok({ context: currentContext, remaining });
}

/**
 * Represents branch and remaining text selection result.
 */
interface IfBranchSelection {
	statement: string | undefined;
	remaining: string;
}

/**
 * Represents if statement branches.
 */
interface IfStatementBranchesInput {
	trueStatementStr: string;
	falseStatementStr: string | undefined;
}

/**
 * Determines the branch to execute and its remaining text.
 */
function selectIfBranchAndRemaining(
	isTruthy: boolean,
	hasElse: boolean,
	branches: IfStatementBranchesInput,
): IfBranchSelection {
	let statement: string | undefined;
	if (isTruthy) {
		statement = branches.trueStatementStr;
	} else if (hasElse) {
		statement = branches.falseStatementStr;
	}

	if (statement === undefined) {
		return {
			statement: undefined,
			remaining: extractRemainingFromStatement(branches.trueStatementStr),
		};
	}

	let remaining: string;
	if (isTruthy && hasElse) {
		remaining = extractRemainingFromStatement(branches.falseStatementStr as string);
	} else {
		remaining = extractRemainingFromStatement(statement);
	}
	return { statement, remaining };
}
function resolveIfRemaining(resultRemaining: string, finalRemaining: string): string {
	if (resultRemaining.trim().length > 0) {
		return resultRemaining;
	}
	return finalRemaining;
}
function processIfStatement(input: string, context: ExecutionContext): Result<ContextAndRemaining> {
	const trimmed = input.trim();
	if (!trimmed.startsWith('if ')) {
		return err('Not an if statement');
	}

	const extracted = extractIfConditionAndAfter(trimmed.substring(3).trim());
	if (extracted === undefined) {
		return err('Invalid if statement');
	}

	const branches = extractIfStatementBranches(extracted.afterCondition);
	if (branches === undefined) {
		return err('Invalid if statement');
	}

	const conditionResult = interpretInternal(extracted.conditionStr, context);
	if (conditionResult.type === 'err') {
		return conditionResult;
	}

	const isTruthy = conditionResult.value !== 0;
	const hasElse = branches.falseStatementStr !== undefined;

	const { statement: statementToExecute, remaining: finalRemaining } = selectIfBranchAndRemaining(
		isTruthy,
		hasElse,
		branches,
	);

	if (statementToExecute === undefined) {
		return ok({ context, remaining: finalRemaining });
	}

	let result: Result<ContextAndRemaining>;
	if (statementToExecute.trim().startsWith('{') && isBalancedBrackets(statementToExecute.trim())) {
		result = processBracedBlock(statementToExecute, context);
	} else {
		result = processStatements(statementToExecute, context, true);
	}

	if (result.type === 'err') {
		return result;
	}
	const remaining = resolveIfRemaining(result.value.remaining, finalRemaining);
	return ok({ context: result.value.context, remaining });
}

/**
 * Processes variable bindings in input (without statement blocks).
 */
export function processVariableBindings(
	input: string,
	context: ExecutionContext,
): Result<ProcessedBindings> {
	const result = processStatements(input, context, false);
	if (result.type === 'err') {
		return result;
	}
	return ok({ context: result.value.context, remaining: result.value.remaining });
}

/**
 * Processes top-level statements including blocks.
 */
export function processTopLevelStatements(
	input: string,
	context: ExecutionContext,
): Result<ContextAndRemaining> {
	return processStatements(input, context, true, true);
}
