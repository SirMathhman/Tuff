import { err, ok, type Result } from './result';
import {
	type ContextAndRemaining,
	type ExecutionContext,
	type IfConditionAndBranches,
	type IfStatementBranches,
	type TypeAnnotationParts,
	findClosingParen,
	findElseKeywordIndex,
	findSemicolonOutsideBrackets,
	findClosingBrace,
	isAssignmentStatement,
	isBalancedBrackets,
	isVariableName,
	isYieldStatement,
	shouldProcessAsStatementBlock,
	validateValueForType,
	type ParsedBinding,
	type ProcessedBindings,
	type VariableBinding,
	type VariableDeclarationParts,
	extractIfConditionAndAfter,
	isWhileStatement,
} from './types';
import { interpretInternal } from './evaluator';
import { parseAssignment } from './assignments';
import { processWhileStatement, processForStatement, isForStatement } from './loops';

/**
 * Parses the type annotation and assignment part after a colon.
 */
function parseTypeAnnotationPart(afterColon: string): TypeAnnotationParts {
	const semiIndex = afterColon.indexOf(';');
	let searchForEqual: string;
	if (semiIndex >= 0) {
		searchForEqual = afterColon.substring(0, semiIndex);
	} else {
		searchForEqual = afterColon;
	}
	const equalIndex = searchForEqual.indexOf('=');

	if (equalIndex >= 0) {
		const typeAnnotation = searchForEqual.substring(0, equalIndex).trim();
		let afterTypeOrName = searchForEqual.substring(equalIndex);
		if (semiIndex >= 0) {
			afterTypeOrName += afterColon.substring(semiIndex);
		}
		return { typeAnnotation, afterTypeOrName };
	}

	const typeAnnotation = searchForEqual.trim();
	return { typeAnnotation, afterTypeOrName: '' };
}

function parseVariableDeclarationHeader(withoutLet: string): Result<VariableDeclarationParts> {
	let isMutable = false;
	let remaining = withoutLet;

	if (withoutLet.startsWith('mut ')) {
		isMutable = true;
		remaining = withoutLet.substring(4).trim();
	}

	const colonIndex = remaining.indexOf(':');
	let varName: string;
	let typeAnnotation: string | undefined;
	let afterTypeOrName: string;

	if (colonIndex >= 0) {
		varName = remaining.substring(0, colonIndex).trim();
		const afterColon = remaining.substring(colonIndex + 1).trim();
		const parts = parseTypeAnnotationPart(afterColon);
		typeAnnotation = parts.typeAnnotation;
		afterTypeOrName = parts.afterTypeOrName;
	} else {
		const equalIndex = remaining.indexOf('=');
		if (equalIndex >= 0) {
			varName = remaining.substring(0, equalIndex).trim();
			afterTypeOrName = remaining.substring(equalIndex);
		} else {
			varName = remaining;
			afterTypeOrName = '';
		}
	}

	if (!isVariableName(varName)) {
		return err(`Invalid variable name: ${varName}`);
	}

	return ok({ varName, isMutable, typeAnnotation, afterTypeOrName });
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
		const semiIndex = findSemicolonOutsideBrackets(withoutLet);
		if (semiIndex < 0) {
			return err('Variable declaration missing semicolon');
		}
		const remaining = withoutLet.substring(semiIndex + 1).trim();
		return ok({ name: varName, value: undefined, isMutable, remaining });
	}

	const withoutEqual = afterTypeOrName.substring(1).trim();
	const semiIndex = findSemicolonOutsideBrackets(withoutEqual);
	if (semiIndex < 0) {
		return err('Variable declaration missing semicolon');
	}

	const valueStr = withoutEqual.substring(0, semiIndex).trim();
	const remaining = withoutEqual.substring(semiIndex + 1).trim();

	const valueResult = interpretInternal(valueStr, context);
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

	const { name, value, isMutable } = bindResult.value;
	if (context.bindings.some((binding): boolean => binding.name === name)) {
		return err(`Variable '${name}' is already defined`);
	}

	const newContext = {
		bindings: [...context.bindings, { name, value, isMutable }],
	};
	return ok({ context: newContext, remaining: bindResult.value.remaining });
}

/**
 * Processes an assignment statement.
 */
function processAssignmentStatement(
	input: string,
	context: ExecutionContext,
): Result<ContextAndRemaining> {
	const assignResult = parseAssignment(input, context);
	if (assignResult.type === 'err') {
		return assignResult;
	}

	const { name, value } = assignResult.value;
	const updatedBindings = context.bindings.map((binding): VariableBinding => {
		if (binding.name === name) {
			return { name, value, isMutable: binding.isMutable };
		}
		return binding;
	});

	const newContext = { bindings: updatedBindings };
	return ok({ context: newContext, remaining: assignResult.value.remaining });
}

/**
 * Handles yield marker in braced block remaining.
 */
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
 * Computes remaining string after block processing.
 */
function computeBlockRemaining(innerRemaining: string, afterBlock: string): string {
	if (innerRemaining.trim().length > 0) {
		return `${innerRemaining.trim()} ${afterBlock}`.trim();
	}
	return afterBlock;
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
	const remaining = computeBlockRemaining(innerRemaining, afterBlock);
	return ok({ context: scopedContext, remaining });
}

/**
 * Processes a yield statement by evaluating the expression and stopping block execution.
 */
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

/**
 * Processes statements (declarations, assignments, if-else, blocks) in input.
 */
export function processStatements(
	input: string,
	context: ExecutionContext,
	allowBlocks: boolean,
): Result<ContextAndRemaining> {
	let currentContext = context;
	let remaining = input;
	while (remaining.trim().length > 0) {
		const trimmed = remaining.trim();
		let result: Result<ContextAndRemaining> | undefined;
		if (trimmed.startsWith('let ')) {
			result = processLetDeclaration(remaining, currentContext);
		} else if (allowBlocks && shouldProcessAsStatementBlock(trimmed)) {
			result = processBracedBlock(remaining, currentContext);
		} else if (isYieldStatement(trimmed)) {
			result = processYieldStatement(remaining, currentContext);
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
		currentContext = result.value.context;
		remaining = result.value.remaining;
	}

	return ok({ context: currentContext, remaining });
}

/**
 * Detects if a statement is an if-else statement (with semicolons).
 */
function isIfStatement(trimmed: string): boolean {
	if (!trimmed.startsWith('if ')) {
		return false;
	}

	// Check if this looks like an if statement: if (...) <statement>; [else <statement>;]
	const afterIf = trimmed.substring(3).trim();
	if (!afterIf.startsWith('(')) {
		return false;
	}

	const conditionEnd = findClosingParen(afterIf);
	if (conditionEnd < 0) {
		return false;
	}

	const afterCondition = afterIf.substring(conditionEnd + 1).trim();
	if (afterCondition.length === 0) {
		return false;
	}

	// Check if there's an else clause
	const elseIndex = findElseKeywordIndex(afterCondition);
	if (elseIndex >= 0) {
		// If-else statement: both branches should have proper syntax
		const trueStatementStr = afterCondition.substring(0, elseIndex).trim();
		const falseStatementStr = afterCondition.substring(elseIndex + 4).trim();

		const isTrueBraced = trueStatementStr.startsWith('{');
		const isFalseBraced = falseStatementStr.startsWith('{');
		const trueSemiIndex = findSemicolonOutsideBrackets(trueStatementStr);
		const falseSemiIndex = findSemicolonOutsideBrackets(falseStatementStr);

		const bothSemicolons = trueSemiIndex >= 0 && falseSemiIndex >= 0;
		const bothBraced = isTrueBraced && isFalseBraced;

		return bothSemicolons || bothBraced;
	}

	// If-only statement (no else): should have a semicolon or braced block
	const isBraced = afterCondition.startsWith('{');
	const semiIndex = findSemicolonOutsideBrackets(afterCondition);

	return isBraced || semiIndex >= 0;
}

/**
 * Extracts the if-statement branches (returns undefined for false branch if no else).
 */
function extractIfStatementBranches(afterCondition: string): IfStatementBranches | undefined {
	const elseIndex = findElseKeywordIndex(afterCondition);

	if (elseIndex < 0) {
		// If-only statement (no else)
		const trueStatementStr = afterCondition.trim();
		if (trueStatementStr.length === 0) {
			return undefined;
		}
		return { trueStatementStr, falseStatementStr: undefined };
	}

	// If-else statement
	const trueStatementStr = afterCondition.substring(0, elseIndex).trim();
	const falseStatementStr = afterCondition.substring(elseIndex + 4).trim();

	if (trueStatementStr.length === 0 || falseStatementStr.length === 0) {
		return undefined;
	}

	return { trueStatementStr, falseStatementStr };
}

/**
 * Extracts remaining string after a braced block.
 */
function extractRemainingFromBracedBlock(falseStatementStr: string): string {
	const closingBraceIndex = findClosingBrace(falseStatementStr);
	if (closingBraceIndex < 0) {
		return '';
	}
	let remaining = falseStatementStr.substring(closingBraceIndex + 1).trim();
	if (remaining.startsWith(';')) {
		remaining = remaining.substring(1).trim();
	}
	return remaining;
}

/**
 * Extracts remaining string after an if statement (without else).
 */
function extractRemainingFromIfStatement(trueStatementStr: string): string {
	const isBraced = trueStatementStr.startsWith('{');
	if (isBraced) {
		return extractRemainingFromBracedBlock(trueStatementStr);
	}

	const semiIndex = findSemicolonOutsideBrackets(trueStatementStr);
	if (semiIndex >= 0) {
		return trueStatementStr.substring(semiIndex + 1).trim();
	}
	return '';
}

/**
 * Extracts remaining string after an else statement.
 */
function extractRemainingFromElseStatement(falseStatementStr: string): string {
	const isBraced = falseStatementStr.startsWith('{');
	if (isBraced) {
		return extractRemainingFromBracedBlock(falseStatementStr);
	}

	const semiIndex = findSemicolonOutsideBrackets(falseStatementStr);
	if (semiIndex >= 0) {
		return falseStatementStr.substring(semiIndex + 1).trim();
	}
	return '';
}

/**
 * Processes the selected branch of an if or if-else statement.
 */
function processBranch(
	statementStr: string,
	context: ExecutionContext,
): Result<ContextAndRemaining> {
	const trimmedStatement = statementStr.trim();
	if (trimmedStatement.startsWith('{') && isBalancedBrackets(trimmedStatement)) {
		return processBracedBlock(statementStr, context);
	}
	return processStatements(statementStr, context, true);
}

/**
 * Determines which branch to execute based on condition truthiness.
 */
function selectIfBranch(
	isTruthy: boolean,
	hasElse: boolean,
	branches: IfStatementBranches,
): string | undefined {
	if (isTruthy) {
		return branches.trueStatementStr;
	}
	if (hasElse) {
		return branches.falseStatementStr;
	}
	return undefined;
}

/**
 * Determines remaining input after if branch execution.
 */
function getRemainingAfterIfExecution(
	branchRemaining: string,
	isTruthy: boolean,
	hasElse: boolean,
	branches: IfStatementBranches,
): string {
	// Check if yield was encountered in the branch
	const trimmedBranchRemaining = branchRemaining.trim();
	if (trimmedBranchRemaining.startsWith('__YIELD__:')) {
		return trimmedBranchRemaining;
	}

	// Otherwise, extract remaining after the if-else structure
	return getRemainingAfterIf(isTruthy, hasElse, branches);
}

/**
 * Determines remaining input after if branch.
 */
function getRemainingAfterIf(
	isTruthy: boolean,
	hasElse: boolean,
	branches: IfStatementBranches,
): string {
	if (isTruthy && hasElse) {
		return extractRemainingFromElseStatement(branches.falseStatementStr as string);
	}

	if (isTruthy) {
		return extractRemainingFromIfStatement(branches.trueStatementStr);
	}

	if (hasElse) {
		return extractRemainingFromElseStatement(branches.falseStatementStr as string);
	}

	return extractRemainingFromIfStatement(branches.trueStatementStr);
}

/**
 * Parses if statement condition and branches.
 */
function parseIfConditionAndBranches(afterIf: string): IfConditionAndBranches | undefined {
	const parsed = extractIfConditionAndAfter(afterIf);
	if (parsed === undefined) {
		return undefined;
	}

	const branches = extractIfStatementBranches(parsed.afterCondition);
	if (branches === undefined) {
		return undefined;
	}

	return { conditionStr: parsed.conditionStr, branches };
}

function processIfStatement(input: string, context: ExecutionContext): Result<ContextAndRemaining> {
	const trimmed = input.trim();
	if (!trimmed.startsWith('if ')) {
		return err('Not an if statement');
	}

	const afterIf = trimmed.substring(3).trim();
	const parsed = parseIfConditionAndBranches(afterIf);
	if (parsed === undefined) {
		return err('Invalid if statement');
	}

	const conditionResult = interpretInternal(parsed.conditionStr, context);
	if (conditionResult.type === 'err') {
		return conditionResult;
	}

	const isTruthy = conditionResult.value !== 0;
	const hasElse = parsed.branches.falseStatementStr !== undefined;
	const statementToExecute = selectIfBranch(isTruthy, hasElse, parsed.branches);

	if (statementToExecute === undefined) {
		const remaining = extractRemainingFromIfStatement(parsed.branches.trueStatementStr);
		return ok({ context, remaining });
	}

	const statementsResult = processBranch(statementToExecute, context);
	if (statementsResult.type === 'err') {
		return statementsResult;
	}

	const remaining = getRemainingAfterIfExecution(
		statementsResult.value.remaining,
		isTruthy,
		hasElse,
		parsed.branches,
	);
	return ok({ context: statementsResult.value.context, remaining });
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
	return processStatements(input, context, true);
}
