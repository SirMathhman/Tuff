import { type Result, err, ok } from './result';

/**
 * Represents a matched operator with its position and precedence level.
 */
export interface OperatorMatch {
	operator: string;
	index: number;
	precedence: number;
}

/**
 * Tracks the lowest precedence operator found so far during scanning.
 */
export interface OperatorPrecedenceState {
	lowestPrecedence: number;
	lowestPrecedenceIndex: number;
	lowestPrecedenceOperator: string;
}

/**
 * Represents a variable binding with an optional value.
 */
export interface VariableBinding {
	name: string;
	value: number | undefined;
	isMutable: boolean;
}

/**
 * Represents the execution context containing all variable bindings.
 */
export interface ExecutionContext {
	bindings: VariableBinding[];
}

/**
 * Represents a parsed variable binding with remaining input.
 */
export interface ParsedBinding {
	name: string;
	value: number | undefined;
	isMutable: boolean;
	remaining: string;
}

/**
 * Represents processed bindings with updated context and remaining input.
 */
export interface ProcessedBindings {
	context: ExecutionContext;
	remaining: string;
}

/**
 * Represents an execution context paired with remaining input.
 */
export interface ContextAndRemaining {
	context: ExecutionContext;
	remaining: string;
}

/**
 * Represents the parsed components of a variable declaration.
 */
export interface VariableDeclarationParts {
	varName: string;
	isMutable: boolean;
	typeAnnotation: string | undefined;
	afterTypeOrName: string;
}

/**
 * Finds the starting index of a type suffix in a literal string.
 * @param input - The input string to search
 * @returns The index where the type suffix starts, or -1 if not found
 */
export function findTypeSuffixStart(input: string): number {
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

/**
 * Extracts the type suffix from a string starting at the given index.
 * @param input - The input string
 * @param suffixStart - The starting index of the type suffix
 * @returns The extracted type suffix
 */
export function extractTypeSuffix(input: string, suffixStart: number): string {
	return input.substring(suffixStart);
}

/**
 * Validates that a value is within the valid range for a given type.
 * @param value - The numeric value to validate
 * @param typeSuffix - The type suffix (e.g., U8, I32)
 * @returns Result containing the value or an error message
 */
export function validateValueForType(value: number, typeSuffix: string): Result<number> {
	if (typeSuffix === 'Bool') {
		if (value !== 0 && value !== 1) {
			return err(`Value ${value} is out of range for Bool (0-1)`);
		}
	}

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

/**
 * Checks if a string starts with a negative sign.
 * @param input - The input string
 * @returns True if the string starts with '-', false otherwise
 */
export function hasNegativeSign(input: string): boolean {
	return input.length > 0 && input.charAt(0) === '-';
}

/**
 * Validates if a string is a valid variable name.
 * @param input - The input string
 * @returns True if the string is a valid identifier, false otherwise
 */
export function isVariableName(input: string): boolean {
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

/**
 * Checks if brackets are properly balanced in a string.
 * @param input - The input string
 * @returns True if brackets are balanced, false otherwise
 */
export function isBalancedBrackets(input: string): boolean {
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

/**
 * Finds the index of a semicolon that is not inside brackets.
 * @param input - The input string
 * @returns The index of the first semicolon outside brackets, or -1 if not found
 */
export function findSemicolonOutsideBrackets(input: string): number {
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

/**
 * Gets the maximum value for a given numeric type.
 * @param typeSuffix - The type suffix (e.g., U8, I32)
 * @returns The maximum value for the type, or 0 if type is unknown
 */
export function getTypeRangeMax(typeSuffix: string): number {
	if (typeSuffix === 'Bool') {
		return 1;
	}

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

/**
 * Extracts the type suffix from a literal string.
 * @param literal - The literal string to search
 * @returns The type suffix if found, undefined otherwise
 */
export function getTypeSuffix(literal: string): string | undefined {
	const trimmed = literal.trim();
	const suffixStart = findTypeSuffixStart(trimmed);

	if (suffixStart >= 0) {
		return extractTypeSuffix(trimmed, suffixStart);
	}

	return undefined;
}

/**
 * Collects all type suffixes found in an input string.
 * @param input - The input string
 * @returns An array of type suffixes found
 */
export function collectTypeSuffixes(input: string): string[] {
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

/**
 * Skips backward over whitespace in a string from a given index.
 * @param input - The input string
 * @param startIndex - The starting index
 * @returns The index of the last non-whitespace character, or -1 if none found
 */
export function skipBackwardWhitespace(input: string, startIndex: number): number {
	let j = startIndex;
	while (j >= 0 && input[j] === ' ') {
		j--;
	}

	return j;
}

/**
 * Checks if a character is alphanumeric.
 * @param char - The character to check
 * @returns True if the character is alphanumeric, false otherwise
 */
export function isAlphanumeric(char: string): boolean {
	const code = char.charCodeAt(0);
	return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/**
 * Gets the precedence level of an operator.
 * @param operator - The operator symbol (plus, minus, asterisk, slash)
 * @returns The precedence level: 1 for addition and subtraction, 2 for multiplication and division, 0 for unknown
 */
export function getOperatorPrecedence(operator: string): number {
	if (operator === '||') {
		return 0;
	}

	if (operator === '&&') {
		return 1;
	}

	if (operator === '+' || operator === '-') {
		return 2;
	}

	if (operator === '*' || operator === '/') {
		return 3;
	}

	return 0;
}

/**
 * Checks if the character before an operator is valid.
 * @param input - The input string
 * @param charIndex - The index of the character to check after
 * @returns True if the previous character is alphanumeric or a closing bracket
 */
export function isPrevCharValidForOperator(input: string, charIndex: number): boolean {
	const prevCharIndex = skipBackwardWhitespace(input, charIndex - 1);
	if (prevCharIndex < 0) {
		return false;
	}

	const prevChar = input[prevCharIndex];
	return isAlphanumeric(prevChar) || prevChar === ')' || prevChar === '}';
}

/**
 * Checks for a two-character operator at the given position.
 * @param input - The input string
 * @param i - The position to check
 * @param operators - The list of valid operators
 * @returns The precedence of the operator, or -1 if not found
 */
export function checkTwoCharOperator(input: string, i: number, operators: string[]): number {
	const twoCharOp = `${input[i]}${input[i + 1]}`;
	if (!operators.includes(twoCharOp) || !isPrevCharValidForOperator(input, i)) {
		return -1;
	}
	return getOperatorPrecedence(twoCharOp);
}

/**
 * Checks for a single-character operator at the given position.
 * @param input - The input string
 * @param char - The character to check
 * @param i - The position to check
 * @param operators - The list of valid operators
 * @returns The precedence of the operator, or -1 if not found
 */
export function checkSingleCharOperator(
	input: string,
	char: string,
	i: number,
	operators: string[],
): number {
	const isSingleOp = ['|', '&'].includes(char) === false;
	const isValidOp = operators.includes(char);
	const isPrevValid = isPrevCharValidForOperator(input, i);
	if (!isSingleOp || !isValidOp || !isPrevValid) {
		return -1;
	}
	return getOperatorPrecedence(char);
}
