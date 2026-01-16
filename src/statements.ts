import { err, ok, type Result } from './result';
import {
	type ContextAndRemaining,
	type ExecutionContext,
	type IfElseBranchesResult,
	type TypeAnnotationParts,
	findClosingParen,
	findElseKeywordIndex,
	findSemicolonOutsideBrackets,
	findClosingBrace,
	isAssignmentStatement,
	isBalancedBrackets,
	isVariableName,
	shouldProcessAsStatementBlock,
	validateValueForType,
	type ParsedBinding,
	type ProcessedBindings,
	type VariableBinding,
	type VariableDeclarationParts,
} from './types';
import { interpretInternal } from './evaluator';

/**
 * Parses the header of a variable declaration (name, mutability, type annotation).
 */
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
 * Parses a variable assignment statement.
 */
function parseAssignment(input: string, context: ExecutionContext): Result<ParsedBinding> {
	const trimmed = input.trim();
	const semiIndex = findSemicolonOutsideBrackets(trimmed);
	if (semiIndex < 0) {
		return err('Assignment missing semicolon');
	}

	const statementStr = trimmed.substring(0, semiIndex).trim();
	const remaining = trimmed.substring(semiIndex + 1).trim();
	const equalIndex = statementStr.indexOf('=');
	if (equalIndex < 0) {
		return err('Invalid statement: expected assignment or variable declaration');
	}

	const varName = statementStr.substring(0, equalIndex).trim();
	if (!isVariableName(varName)) {
		return err(`Invalid variable name: ${varName}`);
	}

	let varBinding: VariableBinding | undefined;
	for (const binding of context.bindings) {
		if (binding.name === varName) {
			varBinding = binding;
			break;
		}
	}

	if (varBinding === undefined) {
		return err(`Undefined variable: ${varName}`);
	}

	const isUninitialized = varBinding.value === undefined;
	if (!isUninitialized && !varBinding.isMutable) {
		return err(`Variable '${varName}' is not mutable`);
	}

	const valueStr = statementStr.substring(equalIndex + 1).trim();
	const valueResult = interpretInternal(valueStr, context);
	if (valueResult.type === 'err') {
		return valueResult;
	}

	return ok({ name: varName, value: valueResult.value, isMutable: varBinding.isMutable, remaining });
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
	// Only propagate changes to existing outer-scope variables, not new declarations
	const scopedContext = {
		bindings: context.bindings.map((outerBinding): VariableBinding => {
			const updated = newContext.bindings.find(
				(binding): boolean => binding.name === outerBinding.name,
			);
			return updated ?? outerBinding;
		}),
	};
	let remaining: string;
	if (innerRemaining.trim().length > 0) {
		remaining = `${innerRemaining.trim()} ${afterBlock}`.trim();
	} else {
		remaining = afterBlock;
	}
	return ok({ context: scopedContext, remaining });
}

/**
 * Detects if a statement is an if-else statement (with semicolons).
 */
function isIfElseStatement(trimmed: string): boolean {
	if (!trimmed.startsWith('if ')) {
		return false;
	}

	// Check if this looks like an if-else statement by finding the pattern
	// if (...) <statement>; else <statement>;
	const afterIf = trimmed.substring(3).trim();
	if (!afterIf.startsWith('(')) {
		return false;
	}

	const conditionEnd = findClosingParen(afterIf);
	if (conditionEnd < 0) {
		return false;
	}

	const afterCondition = afterIf.substring(conditionEnd + 1).trim();
	const elseIndex = findElseKeywordIndex(afterCondition);

	if (elseIndex < 0) {
		return false;
	}

	// Must have semicolons in both branches for this to be a statement
	const trueStatementStr = afterCondition.substring(0, elseIndex).trim();
	const falseStatementStr = afterCondition.substring(elseIndex + 4).trim();

	// Check if both branches contain semicolons (indicating statements, not expressions)
	const trueSemiIndex = findSemicolonOutsideBrackets(trueStatementStr);
	const falseSemiIndex = findSemicolonOutsideBrackets(falseStatementStr);

	return trueSemiIndex >= 0 && falseSemiIndex >= 0;
}

/**
 * Processes an if-else statement with assignment statements.
 */
/**
 * Extracts the if-else statement branches.
 */
function extractIfElseBranches(afterCondition: string): IfElseBranchesResult {
	const elseIndex = findElseKeywordIndex(afterCondition);

	if (elseIndex < 0) {
		return {
			trueStatementStr: '',
			falseStatementStr: '',
			error: 'Expected else in if-else statement',
		};
	}

	const trueStatementStr = afterCondition.substring(0, elseIndex).trim();
	const falseStatementStr = afterCondition.substring(elseIndex + 4).trim();

	if (trueStatementStr.length === 0 || falseStatementStr.length === 0) {
		return {
			trueStatementStr: '',
			falseStatementStr: '',
			error: 'Empty if-else statement branches',
		};
	}

	return { trueStatementStr, falseStatementStr };
}

/**
 * Extracts the remaining string after the false statement.
 */
function extractRemaining(falseStatementStr: string): string {
	const semiIndex = findSemicolonOutsideBrackets(falseStatementStr);
	if (semiIndex >= 0) {
		return falseStatementStr.substring(semiIndex + 1).trim();
	}
	return '';
}

function processIfElseStatement(
	input: string,
	context: ExecutionContext,
): Result<ContextAndRemaining> {
	const trimmed = input.trim();
	if (!trimmed.startsWith('if ')) {
		return err('Not an if-else statement');
	}

	const afterIf = trimmed.substring(3).trim();
	if (!afterIf.startsWith('(')) {
		return err('Expected ( after if');
	}

	const conditionEnd = findClosingParen(afterIf);
	if (conditionEnd < 0) {
		return err('Unbalanced parentheses in if condition');
	}

	const conditionStr = afterIf.substring(1, conditionEnd);
	const afterCondition = afterIf.substring(conditionEnd + 1).trim();

	const branchesResult = extractIfElseBranches(afterCondition);
	if (branchesResult.error !== undefined) {
		return err(branchesResult.error);
	}

	const conditionResult = interpretInternal(conditionStr, context);
	if (conditionResult.type === 'err') {
		return conditionResult;
	}

	const isTruthy = conditionResult.value !== 0;
	let statementStr: string;
	if (isTruthy) {
		statementStr = branchesResult.trueStatementStr;
	} else {
		statementStr = branchesResult.falseStatementStr;
	}

	const statementsResult = processStatements(statementStr, context, true);
	if (statementsResult.type === 'err') {
		return statementsResult;
	}

	const remaining = extractRemaining(branchesResult.falseStatementStr);
	return ok({ context: statementsResult.value.context, remaining });
}

/**
 * Processes statements (declarations, assignments, if-else, blocks) in input.
 */
function processStatements(
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
		} else if (isIfElseStatement(trimmed)) {
			result = processIfElseStatement(remaining, currentContext);
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
