/* eslint-disable max-lines */
import { err, ok, type Result } from './common/result';
import {
	type ContextAndRemaining,
	type ExecutionContext,
	findClosingBrace,
	findSemicolonOutsideBrackets,
	isAssignmentStatement,
	isBalancedBrackets,
	isWhileStatement,
	isYieldStatement,
	shouldProcessAsStatementBlock,
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
} from './structs';
import {
	isFunctionDefinition,
	parseFunctionDefinition,
	registerFunctionDefinition,
} from './functions';
import { parseArrayTypeBinding } from './arrays';
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
	const semiIndex = findSemicolonOutsideBrackets(withoutLet);
	if (semiIndex < 0) {
		return err('Variable declaration missing semicolon');
	}
	const remaining = withoutLet.substring(semiIndex + 1).trim();
	return ok({ name: varName, value: undefined, isMutable, remaining });
}

/**
 * Handles processing variable binding with value and semicolon.
 */
function handleValueBinding(
	varName: string,
	isMutable: boolean,
	typeAnnotation: string | undefined,
	afterTypeOrName: string,
	context: ExecutionContext,
): Result<ParsedBinding> {
	const withoutEqual = afterTypeOrName.substring(1).trim();
	const semiIndex = findSemicolonOutsideBrackets(withoutEqual);
	if (semiIndex < 0) {
		return err('Variable declaration missing semicolon');
	}
	const valueStr = withoutEqual.substring(0, semiIndex).trim();
	const remaining = withoutEqual.substring(semiIndex + 1).trim();
	if (typeAnnotation !== undefined) {
		if (typeAnnotation.startsWith('[')) {
			return parseArrayTypeBinding(varName, isMutable, typeAnnotation, valueStr, remaining, context);
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
	}
	const valueResult = interpretInternal(valueStr, context);
	if (valueResult.type === 'err' && typeAnnotation === undefined) {
		const res = tryParseImplicitStructBinding(varName, isMutable, valueStr, remaining, context);
		if (res !== undefined) {
			return res;
		}
	}
	if (valueResult.type === 'err') {
		return valueResult;
	}
	if (typeAnnotation !== undefined) {
		const typeValidation = validateValueForType(valueResult.value, typeAnnotation);
		if (typeValidation.type === 'err') {
			return typeValidation;
		}
	}
	return ok({ name: varName, value: valueResult.value, isMutable, remaining });
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
	const headerResult = parseVariableDeclarationHeader(withoutLet);
	if (headerResult.type === 'err') {
		return headerResult;
	}

	const { varName, isMutable, typeAnnotation, afterTypeOrName } = headerResult.value;

	if (afterTypeOrName.length === 0) {
		return handleUninitializedDeclaration(varName, isMutable, withoutLet);
	}

	return handleValueBinding(varName, isMutable, typeAnnotation, afterTypeOrName, context);
}
/**
 * Processes a let declaration statement.
 */
function processLetDeclaration(
	input: string,
	context: ExecutionContext,
): Result<ContextAndRemaining> {
	const bindResult = parseVariableBinding(input, context);
	if (bindResult.type === 'err') {
		return bindResult;
	}

	const { name, value, isMutable, structValue, arrayValue, tupleValue, enumValue, pointerValue } =
		bindResult.value;
	if (context.bindings.some((binding): boolean => binding.name === name)) {
		return err(`Variable '${name}' is already defined`);
	}

	const newBinding: VariableBinding = { name, value, isMutable };
	if (structValue !== undefined) {
		newBinding.structValue = structValue;
	}
	if (arrayValue !== undefined) {
		newBinding.arrayValue = arrayValue;
	}
	if (tupleValue !== undefined) {
		newBinding.tupleValue = tupleValue;
	}
	if (enumValue !== undefined) {
		newBinding.enumValue = enumValue;
	}
	if (pointerValue !== undefined) {
		newBinding.pointerValue = pointerValue;
	}
	const newContext = {
		bindings: [...context.bindings, newBinding],
	};
	return ok({ context: newContext, remaining: bindResult.value.remaining });
}
function processAssignmentStatement(
	input: string,
	context: ExecutionContext,
): Result<ContextAndRemaining> {
	const pointerAssign = parsePointerAssignment(input, context);
	if (pointerAssign !== undefined) {
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

	const assignResult = parseAssignment(input, context);
	if (assignResult.type === 'err') {
		return assignResult;
	}
	const { name, value, structValue } = assignResult.value;
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
	return ok({ context: newContext, remaining: assignResult.value.remaining });
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
 */
function processFunctionStatement(input: string): Result<ContextAndRemaining> {
	const parsed = parseFunctionDefinition(input);
	if (parsed.type === 'err') {
		return parsed;
	}
	const registerResult = registerFunctionDefinition(parsed.value.definition);
	if (registerResult.type === 'err') {
		return registerResult;
	}
	return ok({ context: { bindings: [] }, remaining: parsed.value.remaining });
}
/**
 * Processes statements (declarations, assignments, if-else, blocks) in input.
 */
export function processStatements(
	input: string,
	context: ExecutionContext,
	allowBlocks: boolean,
	registerStructs = false,
): Result<ContextAndRemaining> {
	let currentContext = context;
	let remaining = input;
	while (remaining.trim().length > 0) {
		const trimmed = remaining.trim();
		let result: Result<ContextAndRemaining> | undefined;
		if (isEnumDefinition(trimmed)) {
			result = processEnumStatement(remaining, registerStructs);
		} else if (isStructDefinition(trimmed)) {
			result = processStructStatement(remaining, registerStructs);
		} else if (isFunctionDefinition(trimmed)) {
			result = processFunctionStatement(remaining);
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
		if (
			!(isStructDefinition(trimmed) || isFunctionDefinition(trimmed) || isEnumDefinition(trimmed))
		) {
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
