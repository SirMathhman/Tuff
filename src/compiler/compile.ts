import { ok, err, type Result } from '../common/result';
import { compileBracedExpressionsToIife, stripLetTypeAnnotations } from './block-expressions';
import { validateValueForType, hasNegativeSign } from '../common/types';

interface NumericToken {
	consumed: number;
	digits: string;
}

interface LiteralProcessResult {
	token: NumericToken;
	nextIdx: number;
	error?: Result<never>;
}

function isDigit(char: string): boolean {
	return char >= '0' && char <= '9';
}

function isNegativeNumberStart(code: string, idx: number): boolean {
	return code[idx] === '-' && idx + 1 < code.length && isDigit(code[idx + 1]);
}

function isNumericStart(code: string, idx: number): boolean {
	return isDigit(code[idx]) || isNegativeNumberStart(code, idx);
}

function isSuffixChar(char: string): boolean {
	return (
		(char >= '0' && char <= '9') || (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')
	);
}

function countSuffixLength(code: string, startIdx: number): number {
	let length = 0;
	let checkIdx = startIdx;
	while (checkIdx < code.length && isSuffixChar(code[checkIdx])) {
		length++;
		checkIdx++;
	}
	return length;
}

function extractTypeLetters(code: string, startIdx: number): number {
	const suffixLength = countSuffixLength(code, startIdx);
	return startIdx + suffixLength;
}

function countDigits(code: string, startIdx: number): number {
	let count = 0;
	let i = startIdx;
	while (i < code.length && isDigit(code[i])) {
		count++;
		i++;
	}
	return count;
}

function skipNumericDigits(code: string, idx: number): number {
	const digitCount = countDigits(code, idx);
	return idx + digitCount;
}

function extractSuffix(code: string, numEnd: number): number {
	if (numEnd >= code.length) {
		return numEnd;
	}

	const nextChar = code[numEnd];
	if (nextChar !== 'U' && nextChar !== 'I') {
		return numEnd;
	}

	const suffixEnd = extractTypeLetters(code, numEnd + 1);
	if (suffixEnd > numEnd + 1) {
		return suffixEnd;
	}
	return numEnd;
}

function processNumericToken(code: string, idx: number): NumericToken {
	let numStart: number;
	if (code[idx] === '-') {
		numStart = idx + 1;
	} else {
		numStart = idx;
	}
	const numEnd = skipNumericDigits(code, numStart);
	const suffixEnd = extractSuffix(code, numEnd);
	const digits = code.substring(idx, numEnd);
	const consumed = suffixEnd - idx;
	return { consumed, digits };
}

/**
 * Removes type suffixes from numeric literals (e.g., 100U8 -> 100).
 */
function stripTypeSuffixes(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (isNumericStart(code, i)) {
			const token = processNumericToken(code, i);
			result += token.digits;
			i += token.consumed;
		} else {
			result += code[i];
			i++;
		}
	}

	return result;
}

function parseI32(): string {
	return 'parseInt(globalThis.__getNextInput__(), 10)';
}

function parseU8(): string {
	return '(v=>{if(v<0||v>255){process.exitCode=1;return 0;}return v;})(parseInt(globalThis.__getNextInput__(),10))';
}

/**
 * Converts Tuff type annotation to JavaScript code for parsing stdin.
 */
function compileReadFunction(typeAnnotation: string): string {
	const type = typeAnnotation.trim();
	if (type === 'I32' || type === 'i32') {
		return parseI32();
	}
	if (type === 'U8' || type === 'u8') {
		return parseU8();
	}
	return `(() => { throw new Error('Unsupported type: ${type}'); })()`;
}

function replaceReadCalls(jsCode: string): string {
	const readStart = 'read<';
	let current = 0;
	let output = '';

	while (current < jsCode.length) {
		const idx = jsCode.indexOf(readStart, current);
		if (idx === -1) {
			output = output + jsCode.substring(current);
			break;
		}

		output = output + jsCode.substring(current, idx);
		const afterRead = idx + readStart.length;
		const closeIdx = jsCode.indexOf('>()', afterRead);
		if (closeIdx === -1) {
			output = output + jsCode.substring(idx);
			break;
		}

		const type = jsCode.substring(afterRead, closeIdx);
		output = output + compileReadFunction(type);
		current = closeIdx + 3;
	}

	return output;
}

function buildStdinSetup(): string {
	return "const __stdin__=require('fs').readFileSync(0,'utf-8').trim().split(/\\s+/);let __idx__=0;globalThis.__getNextInput__=()=>__idx__<__stdin__.length?__stdin__[__idx__++]:null;";
}

function buildResultWrapper(code: string): string {
	return `const __result__ = ${code}; console.log(__result__); process.exitCode = 0;`;
}

function wrapCompiledCode(code: string, usesStdin: boolean): string {
	const wrapped = buildResultWrapper(code);
	if (usesStdin) {
		return buildStdinSetup() + wrapped;
	}
	return wrapped;
}

function validateTypedLiteral(
	fullLiteral: string,
	typeSuffix: string,
	digits: string,
): Result<void> {
	// Validate negative numbers for unsigned types
	if (hasNegativeSign(digits)) {
		const isUnsigned = typeSuffix.startsWith('U');
		if (isUnsigned) {
			return err('Negative numbers are not supported for unsigned types');
		}
	}

	// Parse the numeric value
	const value = Number.parseInt(digits, 10);
	if (Number.isNaN(value)) {
		return err(`Invalid number literal: ${fullLiteral}`);
	}

	// Validate the value for its type
	const validation = validateValueForType(value, typeSuffix);
	if (validation.type === 'err') {
		return validation;
	}

	return ok(undefined as void);
}

function processLiteralAtPosition(code: string, idx: number): LiteralProcessResult {
	const token = processNumericToken(code, idx);
	const fullLiteral = code.substring(idx, idx + token.consumed);

	// Check if this has a type suffix (last character(s) are type letters)
	if (token.consumed <= token.digits.length) {
		return { token, nextIdx: idx + token.consumed };
	}

	const typeSuffix = fullLiteral.substring(token.digits.length);
	const validation = validateTypedLiteral(fullLiteral, typeSuffix, token.digits);
	if (validation.type === 'err') {
		return { token, nextIdx: idx, error: validation };
	}

	return { token, nextIdx: idx + token.consumed };
}

/**
 * Validates numeric literals with type suffixes in the input.
 * Checks that typed literals are within valid range for their type.
 */
function validateNumericLiterals(code: string): Result<void> {
	let i = 0;

	while (i < code.length) {
		if (!isNumericStart(code, i)) {
			i++;
			continue;
		}

		const result = processLiteralAtPosition(code, i);
		if (result.error !== undefined) {
			return result.error;
		}
		i = result.nextIdx;
	}

	return ok(undefined as void);
}

/**
 * Compiles Tuff source code to JavaScript.
 *
 * @param input - The Tuff source code to compile
 * @returns A Result containing the compiled JavaScript code or an error
 */
export function compile(input: string): Result<string> {
	// Validate numeric literals with type suffixes
	const validation = validateNumericLiterals(input);
	if (validation.type === 'err') {
		return err(validation.error);
	}
	let jsCode = compileBracedExpressionsToIife(stripLetTypeAnnotations(input));

	// Strip type suffixes from numeric literals (100U8 -> 100)
	jsCode = stripTypeSuffixes(jsCode);

	// Replace read<T>() calls with JavaScript code to read from stdin
	jsCode = replaceReadCalls(jsCode);

	// Wrap to capture the result value and output it for the runner to parse
	const usesStdin = input.includes('read<');
	jsCode = wrapCompiledCode(jsCode, usesStdin);

	return ok(jsCode);
}
