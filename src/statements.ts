import { err, ok, type Result } from './result';
import {
	type ContextAndRemaining,
	type ExecutionContext,
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
		const equalIndexAfterColon = afterColon.indexOf('=');
		if (equalIndexAfterColon >= 0) {
			typeAnnotation = afterColon.substring(0, equalIndexAfterColon).trim();
			afterTypeOrName = afterColon.substring(equalIndexAfterColon);
		} else {
			typeAnnotation = afterColon;
			afterTypeOrName = '';
		}
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

	if (!varBinding.isMutable) {
		return err(`Variable '${varName}' is not mutable`);
	}

	const valueStr = statementStr.substring(equalIndex + 1).trim();
	const valueResult = interpretInternal(valueStr, context);
	if (valueResult.type === 'err') {
		return valueResult;
	}

	return ok({ name: varName, value: valueResult.value, isMutable: true, remaining });
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
 * Processes statements (declarations, assignments, blocks) in input.
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
