import { type Result, err, ok } from './result';

export interface OperatorMatch {
	operator: string;
	index: number;
	precedence: number;
}

export interface VariableBinding {
	name: string;
	value: number | undefined;
}

export interface ExecutionContext {
	bindings: VariableBinding[];
}

export interface ParsedBinding {
	name: string;
	value: number | undefined;
	remaining: string;
}

export interface ProcessedBindings {
	context: ExecutionContext;
	remaining: string;
}

export interface ContextAndRemaining {
	context: ExecutionContext;
	remaining: string;
}

export interface VariableDeclarationParts {
	varName: string;
	typeAnnotation: string | undefined;
	afterTypeOrName: string;
}

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

export function extractTypeSuffix(input: string, suffixStart: number): string {
	return input.substring(suffixStart);
}

export function validateValueForType(value: number, typeSuffix: string): Result<number> {
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

export function hasNegativeSign(input: string): boolean {
	return input.length > 0 && input.charAt(0) === '-';
}

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

export function getTypeRangeMax(typeSuffix: string): number {
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

export function getTypeSuffix(literal: string): string | undefined {
	const trimmed = literal.trim();
	const suffixStart = findTypeSuffixStart(trimmed);

	if (suffixStart >= 0) {
		return extractTypeSuffix(trimmed, suffixStart);
	}

	return undefined;
}

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

export function skipBackwardWhitespace(input: string, startIndex: number): number {
	let j = startIndex;
	while (j >= 0 && input[j] === ' ') {
		j--;
	}

	return j;
}

export function isAlphanumeric(char: string): boolean {
	const code = char.charCodeAt(0);
	return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

export function getOperatorPrecedence(operator: string): number {
	if (operator === '+' || operator === '-') {
		return 1;
	}

	if (operator === '*' || operator === '/') {
		return 2;
	}

	return 0;
}
