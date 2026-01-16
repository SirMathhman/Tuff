import { type Result, err, ok } from './result';

interface OperatorMatch {
	operator: string;
	index: number;
	precedence: number;
}

interface VariableBinding {
	name: string;
	value: number | undefined;
}

interface ExecutionContext {
	bindings: VariableBinding[];
}

interface ParsedBinding {
	name: string;
	value: number | undefined;
	remaining: string;
}

interface ProcessedBindings {
	context: ExecutionContext;
	remaining: string;
}

interface ContextAndRemaining {
	context: ExecutionContext;
	remaining: string;
}

function findTypeSuffixStart(input: string): number {
	for (let i = input.length - 1; i >= 0; i--) {
		const char = input.charAt(i);
		const isDigit = !Number.isNaN(Number.parseInt(char, 10));

		if (!isDigit) {
			return -1;
		}

		if (i === 0) {
			return -1;
		}

		const prevChar = input.charAt(i - 1);
		if (prevChar === 'U' || prevChar === 'I') {
			return i - 1;
		}
	}

	return -1;
}

function extractTypeSuffix(input: string, suffixStart: number): string {
	return input.substring(suffixStart);
}

function validateValueForType(value: number, typeSuffix: string): Result<number> {
	if (typeSuffix === 'U8') {
		if (value < 0 || value > 255) {
			return err(`Value ${value} is out of range for U8 (0-255)`);
		}
	}

	if (typeSuffix === 'U16') {
		if (value < 0 || value > 65535) {
			return err(`Value ${value} is out of range for U16 (0-65535)`);
		}
	}

	if (typeSuffix === 'I8') {
		if (value < -128 || value > 127) {
			return err(`Value ${value} is out of range for I8 (-128-127)`);
		}
	}

	if (typeSuffix === 'I32') {
		if (value < -2147483648 || value > 2147483647) {
			return err(`Value ${value} is out of range for I32 (-2147483648-2147483647)`);
		}
	}

	if (typeSuffix === 'U32') {
		if (value < 0 || value > 4294967295) {
			return err(`Value ${value} is out of range for U32 (0-4294967295)`);
		}
	}

	if (typeSuffix === 'I16') {
		if (value < -32768 || value > 32767) {
			return err(`Value ${value} is out of range for I16 (-32768-32767)`);
		}
	}

	return ok(value);
}

function hasNegativeSign(input: string): boolean {
	return input.length > 0 && input.charAt(0) === '-';
}

interface VariableDeclarationParts {
	varName: string;
	typeAnnotation: string | undefined;
	afterTypeOrName: string;
}

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
			// No assignment operator - just type annotation
			typeAnnotation = afterColon;
			afterTypeOrName = '';
		}
	} else {
		const equalIndex = withoutLet.indexOf('=');
		if (equalIndex >= 0) {
			varName = withoutLet.substring(0, equalIndex).trim();
			afterTypeOrName = withoutLet.substring(equalIndex);
		} else {
			// No assignment operator - just variable name
			varName = withoutLet;
			afterTypeOrName = '';
		}
	}

	if (!isVariableName(varName)) {
		return err(`Invalid variable name: ${varName}`);
	}

	return ok({ varName, typeAnnotation, afterTypeOrName });
}

function findSemicolonOutsideBrackets(input: string): number {
	let bracketDepth = 0;
	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		if (char === '(' || char === '{') {
			bracketDepth++;
		} else if (char === ')' || char === '}') {
			bracketDepth--;
		} else if (char === ';' && bracketDepth === 0) {
			return i;
		}
	}
	return -1;
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

	// If no assignment operator, this is an uninitialized declaration
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

function isVariableName(input: string): boolean {
	const trimmed = input.trim();
	if (trimmed.length === 0) {
		return false;
	}

	const firstChar = trimmed.charAt(0);
	const isFirstCharValid =
		(firstChar >= 'a' && firstChar <= 'z') ||
		(firstChar >= 'A' && firstChar <= 'Z') ||
		firstChar === '_';
	if (!isFirstCharValid) {
		return false;
	}

	for (let i = 1; i < trimmed.length; i++) {
		const char = trimmed.charAt(i);
		const isCharValid =
			(char >= 'a' && char <= 'z') ||
			(char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') ||
			char === '_';
		if (!isCharValid) {
			return false;
		}
	}

	return true;
}

function isBalancedBrackets(input: string): boolean {
	const trimmed = input.trim();
	const isParens = trimmed.startsWith('(') && trimmed.endsWith(')');
	const isBraces = trimmed.startsWith('{') && trimmed.endsWith('}');
	if (!isParens && !isBraces) {
		return false;
	}

	let depth = 0;
	for (let i = 0; i < trimmed.length; i++) {
		const char = trimmed[i];
		if (char === '(' || char === '{') {
			depth++;
		} else if (char === ')' || char === '}') {
			depth--;
		}

		if (depth === 0 && i < trimmed.length - 1) {
			return false;
		}

		if (depth < 0) {
			return false;
		}
	}

	return depth === 0;
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

	// Check if variable exists
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
	const updatedBindings = context.bindings.map((binding) => {
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

	// Check if variable name
	if (isVariableName(trimmed)) {
		return lookupVariable(trimmed, context);
	}

	// Check if this is a parenthesized expression
	if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
		if (isBalancedBrackets(trimmed)) {
			const inner = trimmed.substring(1, trimmed.length - 1);
			return interpretInternal(inner, context);
		}
	}

	// Check if this is a braced expression (may contain variable bindings)
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

function getTypeRangeMax(typeSuffix: string): number {
	if (typeSuffix === 'U8') {
		return 255;
	}

	if (typeSuffix === 'U16') {
		return 65535;
	}

	if (typeSuffix === 'I8') {
		return 127;
	}

	if (typeSuffix === 'I16') {
		return 32767;
	}

	if (typeSuffix === 'U32') {
		return 4294967295;
	}

	if (typeSuffix === 'I32') {
		return 2147483647;
	}

	return 0;
}

function getTypeSuffix(literal: string): string | undefined {
	const trimmed = literal.trim();
	const suffixStart = findTypeSuffixStart(trimmed);

	if (suffixStart >= 0) {
		return extractTypeSuffix(trimmed, suffixStart);
	}

	return undefined;
}

function collectTypeSuffixes(input: string): string[] {
	const suffixes: string[] = [];
	let current = '';

	for (const char of input) {
		if (char !== '+' && char !== '-' && char !== '*' && char !== '/') {
			current += char;
			continue;
		}

		const suffix = getTypeSuffix(current);
		if (suffix !== undefined) {
			suffixes.push(suffix);
		}

		current = '';
	}

	const suffix = getTypeSuffix(current);
	if (suffix !== undefined) {
		suffixes.push(suffix);
	}

	return suffixes;
}

function skipBackwardWhitespace(input: string, startIndex: number): number {
	let j = startIndex;
	while (j >= 0 && input[j] === ' ') {
		j--;
	}

	return j;
}

function isAlphanumeric(char: string): boolean {
	const code = char.charCodeAt(0);
	return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function getOperatorPrecedence(operator: string): number {
	if (operator === '+' || operator === '-') {
		return 1;
	}

	if (operator === '*' || operator === '/') {
		return 2;
	}

	return 0;
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
		const largestType = allTypeSuffixes.reduce((largest, current) => {
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
