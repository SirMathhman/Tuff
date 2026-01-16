import { err, ok, type Result } from './result';
import {
	collectTypeSuffixes,
	type ContextAndRemaining,
	type ExecutionContext,
	extractTypeSuffix,
	findSemicolonOutsideBrackets,
	findTypeSuffixStart,
	getOperatorPrecedence,
	getTypeRangeMax,
	hasNegativeSign,
	isAlphanumeric,
	isBalancedBrackets,
	isVariableName,
	type OperatorMatch,
	type ParsedBinding,
	type ProcessedBindings,
	skipBackwardWhitespace,
	validateValueForType,
	type VariableBinding,
	type VariableDeclarationParts,
} from './types';

function parseVariableDeclarationHeader(withoutLet: string): Result<VariableDeclarationParts> {
	const colonIndex = withoutLet.indexOf(':');
	let varName: string;
	let typeAnnotation: string | undefined;
	let afterTypeOrName: string;

	if (colonIndex >= 0) {
		varName = withoutLet.substring(0, colonIndex).trim();
		const afterColon = withoutLet.substring(colonIndex + 1).trim();
		const equalIndexAfterColon = afterColon.indexOf('=');
		if (equalIndexAfterColon >= 0) {
			typeAnnotation = afterColon.substring(0, equalIndexAfterColon).trim();
			afterTypeOrName = afterColon.substring(equalIndexAfterColon);
		} else {
			typeAnnotation = afterColon;
			afterTypeOrName = '';
		}
	} else {
		const equalIndex = withoutLet.indexOf('=');
		if (equalIndex >= 0) {
			varName = withoutLet.substring(0, equalIndex).trim();
			afterTypeOrName = withoutLet.substring(equalIndex);
		} else {
			varName = withoutLet;
			afterTypeOrName = '';
		}
	}

	if (!isVariableName(varName)) {
		return err(`Invalid variable name: ${varName}`);
	}

	return ok({ varName, typeAnnotation, afterTypeOrName });
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

	const { varName, typeAnnotation, afterTypeOrName } = headerResult.value;

	if (afterTypeOrName.length === 0) {
		const semiIndex = findSemicolonOutsideBrackets(withoutLet);
		if (semiIndex < 0) {
			return err('Variable declaration missing semicolon');
		}
		const remaining = withoutLet.substring(semiIndex + 1).trim();
		return ok({ name: varName, value: undefined, remaining });
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

	return ok({ name: varName, value: valueResult.value, remaining });
}

function findBindingByName(name: string, context: ExecutionContext): VariableBinding | undefined {
	for (const binding of context.bindings) {
		if (binding.name === name) {
			return binding;
		}
	}

	return undefined;
}

function lookupVariable(name: string, context: ExecutionContext): Result<number> {
	const binding = findBindingByName(name, context);
	if (binding === undefined) {
		return err(`Undefined variable: ${name}`);
	}

	if (binding.value === undefined) {
		return err(`Variable '${name}' is not initialized`);
	}

	return ok(binding.value);
}

function isDuplicateVariable(name: string, context: ExecutionContext): boolean {
	for (const binding of context.bindings) {
		if (binding.name === name) {
			return true;
		}
	}

	return false;
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

	let varExists = false;
	for (const binding of context.bindings) {
		if (binding.name === varName) {
			varExists = true;
			break;
		}
	}

	if (!varExists) {
		return err(`Undefined variable: ${varName}`);
	}

	const valueStr = statementStr.substring(equalIndex + 1).trim();
	const valueResult = interpretInternal(valueStr, context);
	if (valueResult.type === 'err') {
		return valueResult;
	}

	return ok({ name: varName, value: valueResult.value, remaining });
}

function processLetDeclaration(
	input: string,
	context: ExecutionContext,
): Result<ContextAndRemaining> {
	const bindResult = parseVariableBinding(input, context);
	if (bindResult.type === 'err') {
		return bindResult;
	}

	const { name, value } = bindResult.value;
	if (isDuplicateVariable(name, context)) {
		return err(`Variable '${name}' is already defined`);
	}

	const newContext = {
		bindings: [...context.bindings, { name, value }],
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
			return { name, value };
		}
		return binding;
	});

	const newContext = { bindings: updatedBindings };
	return ok({ context: newContext, remaining: assignResult.value.remaining });
}

function isAssignmentStatement(trimmed: string): boolean {
	const equalsIndex = trimmed.indexOf('=');
	if (equalsIndex <= 0) {
		return false;
	}

	const potentialVarName = trimmed.substring(0, equalsIndex).trim();
	const charAfter = trimmed.charAt(equalsIndex + 1);
	return isVariableName(potentialVarName) && charAfter !== '=';
}

function processVariableBindings(
	input: string,
	context: ExecutionContext,
): Result<ProcessedBindings> {
	let currentContext = context;
	let remaining = input;

	while (remaining.trim().length > 0) {
		const trimmed = remaining.trim();
		let result: Result<ContextAndRemaining> | undefined;

		if (trimmed.startsWith('let ')) {
			result = processLetDeclaration(remaining, currentContext);
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

function isPrevCharValidForOperator(input: string, charIndex: number): boolean {
	const prevCharIndex = skipBackwardWhitespace(input, charIndex - 1);
	if (prevCharIndex < 0) {
		return false;
	}

	const prevChar = input[prevCharIndex];
	return isAlphanumeric(prevChar) || prevChar === ')' || prevChar === '}';
}

function findOperator(input: string): OperatorMatch | undefined {
	const operators = ['+', '-', '*', '/'];
	let lowestPrecedence = Infinity;
	let lowestPrecedenceIndex = -1;
	let lowestPrecedenceOperator = '';
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

		if (bracketDepth > 0 || !operators.includes(char)) {
			continue;
		}

		if (!isPrevCharValidForOperator(input, i)) {
			continue;
		}

		const precedence = getOperatorPrecedence(char);
		if (precedence <= lowestPrecedence) {
			lowestPrecedence = precedence;
			lowestPrecedenceIndex = i;
			lowestPrecedenceOperator = char;
		}
	}

	if (lowestPrecedenceIndex < 0) {
		return undefined;
	}

	return {
		operator: lowestPrecedenceOperator,
		index: lowestPrecedenceIndex,
		precedence: lowestPrecedence,
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

	return err(`Unknown operator: ${operator}`);
}

/**
 * Interprets a mathematical expression with typed numeric literals and variable bindings.
 * Supports arithmetic operations, type annotations, variable declarations, and assignments.
 * @param input - The expression string to interpret
 * @returns Result containing the evaluated number or an error message
 */
export function interpret(input: string): Result<number> {
	const bindingsResult = processVariableBindings(input, { bindings: [] });
	if (bindingsResult.type === 'err') {
		return bindingsResult;
	}

	const { context, remaining } = bindingsResult.value;
	const trimmedRemaining = remaining.trim();
	if (trimmedRemaining.length === 0) {
		return err('Expression required after variable declarations');
	}

	return interpretInternal(trimmedRemaining, context);
}

function interpretInternal(input: string, context: ExecutionContext): Result<number> {
	const operatorMatch = findOperator(input);

	if (operatorMatch === undefined) {
		return parseLiteral(input, context);
	}

	const { operator, index: operatorIndex } = operatorMatch;
	const leftStr = input.substring(0, operatorIndex);
	const rightStr = input.substring(operatorIndex + 1);

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
