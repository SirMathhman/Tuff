import { err, ok, type Result } from './result';
import {
	checkSingleCharOperator,
	checkTwoCharOperator,
	collectTypeSuffixes,
	type ContextAndRemaining,
	type ExecutionContext,
	extractTypeSuffix,
	findSemicolonOutsideBrackets,
	findTypeSuffixStart,
	getTypeRangeMax,
	hasNegativeSign,
	isBalancedBrackets,
	isVariableName,
	type OperatorMatch,
	type OperatorPrecedenceState,
	type ParsedBinding,
	type ProcessedBindings,
	validateValueForType,
	type VariableBinding,
	type VariableDeclarationParts,
} from './types';

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
function isAssignmentStatement(s: string): boolean {
	const eq = s.indexOf('=');
	return eq > 0 && isVariableName(s.substring(0, eq).trim()) && s.charAt(eq + 1) !== '=';
}

function findClosingBrace(s: string): number {
	let depth = 0;
	for (let i = 0; i < s.length; i++) {
		if (s[i] === '{') {
			depth++;
		}
		if (s[i] === '}') {
			depth--;
		}
		if (depth === 0 && s[i] === '}') {
			return i;
		}
	}
	return -1;
}
function containsStatements(braced: string): boolean {
	const trimmed = braced.trim();
	if (!trimmed.startsWith('{')) {
		return false;
	}

	const closingBraceIndex = findClosingBrace(trimmed);
	if (closingBraceIndex === -1) {
		return false;
	}

	const inner = trimmed.substring(1, closingBraceIndex).trim();
	if (inner.length === 0 || !inner.startsWith('let ')) {
		const firstSemiIndex = findSemicolonOutsideBrackets(inner);
		return firstSemiIndex >= 0 && isAssignmentStatement(inner.substring(0, firstSemiIndex).trim());
	}
	return true;
}
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

function processVariableBindings(
	input: string,
	context: ExecutionContext,
): Result<ProcessedBindings> {
	const result = processStatements(input, context, false);
	if (result.type === 'err') {
		return result;
	}
	return ok({ context: result.value.context, remaining: result.value.remaining });
}

function parseBracedExpression(trimmed: string, context: ExecutionContext): Result<number> {
	if (!isBalancedBrackets(trimmed)) {
		return err('Unbalanced brackets');
	}

	const inner = trimmed.substring(1, trimmed.length - 1);
	const bindingsResult = processVariableBindings(inner, context);
	if (bindingsResult.type === 'err') {
		return bindingsResult;
	}

	const { context: newContext, remaining } = bindingsResult.value;
	const trimmedRemaining = remaining.trim();
	if (trimmedRemaining.length === 0) {
		return err('Braced expression must contain an expression after variable declarations');
	}

	return interpretInternal(trimmedRemaining, newContext);
}

function parseLiteral(literal: string, context: ExecutionContext): Result<number> {
	const trimmed = literal.trim();

	if (trimmed === 'true') {
		return ok(1);
	}

	if (trimmed === 'false') {
		return ok(0);
	}

	if (isVariableName(trimmed)) {
		return lookupVariable(trimmed, context);
	}

	if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
		if (isBalancedBrackets(trimmed)) {
			const inner = trimmed.substring(1, trimmed.length - 1);
			return interpretInternal(inner, context);
		}
	}

	if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
		return parseBracedExpression(trimmed, context);
	}

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

	if (suffixStart >= 0) {
		const typeSuffix = extractTypeSuffix(trimmed, suffixStart);
		return validateValueForType(value, typeSuffix);
	}

	return ok(value);
}

function updateLowestPrecedence(
	precedence: number,
	index: number,
	operator: string,
	state: OperatorPrecedenceState,
): void {
	if (precedence <= state.lowestPrecedence) {
		state.lowestPrecedence = precedence;
		state.lowestPrecedenceIndex = index;
		state.lowestPrecedenceOperator = operator;
	}
}

function checkOperatorAtPosition(
	input: string,
	i: number,
	char: string,
	operators: string[],
	state: OperatorPrecedenceState,
): number {
	if (i < input.length - 1) {
		const twoCharPrec = checkTwoCharOperator(input, i, operators);
		if (twoCharPrec >= 0) {
			updateLowestPrecedence(twoCharPrec, i, input.substring(i, i + 2), state);
			return 1; // Signal to skip next char
		}
	}
	const singleCharPrec = checkSingleCharOperator(input, char, i, operators);
	if (singleCharPrec >= 0) {
		updateLowestPrecedence(singleCharPrec, i, char, state);
	}
	return 0;
}

function findOperator(input: string): OperatorMatch | undefined {
	const operators = ['+', '-', '*', '/', '||', '&&'];
	const state: OperatorPrecedenceState = {
		lowestPrecedence: Infinity,
		lowestPrecedenceIndex: -1,
		lowestPrecedenceOperator: '',
	};
	let bracketDepth = 0;
	if (input.startsWith('(') || input.startsWith('{')) {
		bracketDepth = 1;
	}
	for (let i = 1; i < input.length; i++) {
		const char = input[i];
		if (char === '(' || char === '{') {
			bracketDepth++;
			continue;
		}
		if (char === ')' || char === '}') {
			bracketDepth--;
			continue;
		}
		if (bracketDepth > 0) {
			continue;
		}
		const skip = checkOperatorAtPosition(input, i, char, operators, state);
		if (skip) {
			i++;
		}
	}
	if (state.lowestPrecedenceIndex < 0) {
		return undefined;
	}
	return {
		operator: state.lowestPrecedenceOperator,
		index: state.lowestPrecedenceIndex,
		precedence: state.lowestPrecedence,
	};
}

function evaluateBinaryOp(left: number, operator: string, right: number): Result<number> {
	if (operator === '+') {
		return ok(left + right);
	}

	if (operator === '-') {
		return ok(left - right);
	}

	if (operator === '*') {
		return ok(left * right);
	}

	if (operator === '/') {
		if (right === 0) {
			return err('Division by zero');
		}

		return ok(Math.floor(left / right));
	}

	if (operator === '||') {
		const result = left !== 0 || right !== 0;
		return ok(Number(result));
	}

	if (operator === '&&') {
		const result = left !== 0 && right !== 0;
		return ok(Number(result));
	}

	return err(`Unknown operator: ${operator}`);
}

function shouldProcessAsStatementBlock(t: string): boolean {
	if (!t.startsWith('{') || !containsStatements(t)) {
		return false;
	}
	const ci = findClosingBrace(t);
	return ci >= 0 && ci < t.length - 1;
}

/**
 * Interprets a mathematical expression with typed numeric literals and variable bindings.
 * Supports arithmetic operations, type annotations, variable declarations, and assignments.
 * @param input - The expression string to interpret
 * @returns Result containing the evaluated number or an error message
 */
export function interpret(input: string): Result<number> {
	const result = processStatements(input, { bindings: [] }, true);
	if (result.type === 'err') {
		return result;
	}

	const trimmedRemaining = result.value.remaining.trim();
	if (trimmedRemaining.length === 0) {
		return err('expression required after variable declarations');
	}

	return interpretInternal(trimmedRemaining, result.value.context);
}

function interpretInternal(input: string, context: ExecutionContext): Result<number> {
	const operatorMatch = findOperator(input);

	if (operatorMatch === undefined) {
		return parseLiteral(input, context);
	}

	const { operator, index: operatorIndex } = operatorMatch;
	const leftStr = input.substring(0, operatorIndex);
	const rightStr = input.substring(operatorIndex + operator.length);

	const leftInterpret = interpretInternal(leftStr, context);
	if (leftInterpret.type === 'err') {
		return leftInterpret;
	}

	const rightInterpret = interpretInternal(rightStr, context);
	if (rightInterpret.type === 'err') {
		return rightInterpret;
	}

	const opResult = evaluateBinaryOp(leftInterpret.value, operator, rightInterpret.value);
	if (opResult.type === 'err') {
		return opResult;
	}

	const allTypeSuffixes = collectTypeSuffixes(input);
	if (allTypeSuffixes.length > 0) {
		const largestType = allTypeSuffixes.reduce((largest, current): string => {
			const currentMax = getTypeRangeMax(current);
			const largestMax = getTypeRangeMax(largest);
			if (currentMax >= largestMax) {
				return current;
			}
			return largest;
		});
		return validateValueForType(opResult.value, largestType);
	}

	return opResult;
}
