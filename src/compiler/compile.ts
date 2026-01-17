import { ok, err, type Result } from '../common/result';
import { compileBracedExpressionsToIife, stripLetTypeAnnotations } from './block-expressions';
import { validateValueForType, hasNegativeSign } from '../common/types';
import { interpretInternal } from '../interpreter/evaluator';

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

function replaceBooleans(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		// Check for 'true' keyword
		if (isKeywordAt(code, i, 'true')) {
			result += '1';
			i += 4;
			continue;
		}

		// Check for 'false' keyword
		if (isKeywordAt(code, i, 'false')) {
			result += '0';
			i += 5;
			continue;
		}

		result += code[i];
		i++;
	}

	return result;
}

function isKeywordAt(code: string, idx: number, keyword: string): boolean {
	if (idx + keyword.length > code.length) {
		return false;
	}
	if (code.substring(idx, idx + keyword.length) !== keyword) {
		return false;
	}

	// Check boundaries
	const before = idx > 0 ? code[idx - 1] : undefined;
	const after = idx + keyword.length < code.length ? code[idx + keyword.length] : undefined;

	const isIdentChar = (ch: string | undefined): boolean => {
		if (ch === undefined) {
			return false;
		}
		return (
			(ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_'
		);
	};

	if (before !== undefined && isIdentChar(before)) {
		return false;
	}
	if (after !== undefined && isIdentChar(after)) {
		return false;
	}

	return true;
}

function findMatchingParen(code: string, openIdx: number): number {
	let depth = 1;
	let i = openIdx + 1;
	while (i < code.length && depth > 0) {
		if (code[i] === '(') {
			depth++;
		} else if (code[i] === ')') {
			depth--;
		}
		if (depth === 0) {
			return i;
		}
		i++;
	}
	return -1;
}

function findElseKeyword(code: string, startIdx: number): number {
	let depth = 0;
	let ifDepth = 0;
	let i = startIdx;

	while (i < code.length) {
		if (code[i] === '(') {
			depth++;
		} else if (code[i] === ')') {
			depth--;
		} else if (code[i] === '{') {
			depth++;
		} else if (code[i] === '}') {
			depth--;
		}

		if (depth === 0) {
			if (isKeywordAt(code, i, 'if')) {
				ifDepth++;
				i += 2;
				continue;
			}
			if (isKeywordAt(code, i, 'else')) {
				if (ifDepth === 0) {
					return i;
				}
				ifDepth--;
				i += 4;
				continue;
			}
		}

		i++;
	}

	return -1;
}

function findMatchingBrace(code: string, startIdx: number): number {
	let depth = 1;
	let i = startIdx + 1;
	while (i < code.length && depth > 0) {
		if (code[i] === '{') {
			depth++;
		} else if (code[i] === '}') {
			depth--;
		}
		i++;
	}
	return i;
}

interface IfParts {
	condition: string;
	thenBranch: string;
	elseBranch: string;
	endIdx: number;
}

function parseIfExpression(code: string, ifIdx: number): IfParts | undefined {
	// Skip 'if'
	let i = ifIdx + 2;

	// Skip whitespace
	while (i < code.length && (code[i] === ' ' || code[i] === '\t' || code[i] === '\n')) {
		i++;
	}

	// Expect '('
	if (i >= code.length || code[i] !== '(') {
		return undefined;
	}

	const condStart = i + 1;
	const condEnd = findMatchingParen(code, i);
	if (condEnd === -1) {
		return undefined;
	}

	const condition = code.substring(condStart, condEnd);
	i = condEnd + 1;

	// Skip whitespace
	while (i < code.length && (code[i] === ' ' || code[i] === '\t' || code[i] === '\n')) {
		i++;
	}

	// Parse then branch (can be a block or expression)
	const thenStart = i;
	let thenEnd = i;

	if (code[i] === '{') {
		// Block - find matching }
		thenEnd = findMatchingBrace(code, i);
		i = thenEnd;
	} else {
		// Expression - find 'else' keyword
		const elseIdx = findElseKeyword(code, i);
		if (elseIdx === -1) {
			return undefined;
		}
		thenEnd = elseIdx;
		i = elseIdx;
	}

	const thenBranch = code.substring(thenStart, thenEnd).trim();

	// Skip 'else'
	if (!isKeywordAt(code, i, 'else')) {
		return undefined;
	}
	i += 4;

	// Skip whitespace
	while (i < code.length && (code[i] === ' ' || code[i] === '\t' || code[i] === '\n')) {
		i++;
	}

	// Parse else branch
	const elseStart = i;
	let elseEnd = i;

	if (code[i] === '{') {
		// Block - find matching }
		elseEnd = findMatchingBrace(code, i);
		i = elseEnd;
	} else if (isKeywordAt(code, i, 'if')) {
		// Nested if-else - recursively parse it
		const nested = parseIfExpression(code, i);
		if (nested === undefined) {
			return undefined;
		}
		elseEnd = nested.endIdx;
		i = elseEnd;
	} else {
		// Expression - find end (semicolon, closing brace, or end of code)
		// For simplicity, consume until we hit a character that suggests end of expression
		while (i < code.length) {
			const ch = code[i];
			if (ch === ';' || ch === '}' || ch === ')') {
				break;
			}
			i++;
		}
		elseEnd = i;
	}

	const elseBranch = code.substring(elseStart, elseEnd).trim();

	return {
		condition,
		thenBranch,
		elseBranch,
		endIdx: elseEnd,
	};
}

function replaceYieldWithReturn(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (isKeywordAt(code, i, 'yield')) {
			result += 'return';
			i += 5;
		} else {
			result += code[i];
			i++;
		}
	}

	return result;
}

function replaceForLoops(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (isKeywordAt(code, i, 'for')) {
			// Parse: for (let mut VAR in START..END) BODY
			let j = i + 3;

			// Skip whitespace
			while (j < code.length && (code[j] === ' ' || code[j] === '\t' || code[j] === '\n')) {
				j++;
			}

			// Expect '('
			if (j >= code.length || code[j] !== '(') {
				result += code[i];
				i++;
				continue;
			}
			j++;

			// Skip whitespace
			while (j < code.length && (code[j] === ' ' || code[j] === '\t' || code[j] === '\n')) {
				j++;
			}

			// Expect 'let'
			if (!isKeywordAt(code, j, 'let')) {
				result += code.substring(i, j);
				i = j;
				continue;
			}
			j += 3;

			// Skip whitespace and optional 'mut'
			while (j < code.length && (code[j] === ' ' || code[j] === '\t' || code[j] === '\n')) {
				j++;
			}
			if (isKeywordAt(code, j, 'mut')) {
				j += 3;
				while (j < code.length && (code[j] === ' ' || code[j] === '\t' || code[j] === '\n')) {
					j++;
				}
			}

			// Read variable name
			const varStart = j;
			while (
				j < code.length &&
				((code[j] >= 'a' && code[j] <= 'z') ||
					(code[j] >= 'A' && code[j] <= 'Z') ||
					(code[j] >= '0' && code[j] <= '9') ||
					code[j] === '_')
			) {
				j++;
			}
			const varName = code.substring(varStart, j);

			// Skip whitespace
			while (j < code.length && (code[j] === ' ' || code[j] === '\t' || code[j] === '\n')) {
				j++;
			}

			// Expect 'in'
			if (!isKeywordAt(code, j, 'in')) {
				result += code.substring(i, j);
				i = j;
				continue;
			}
			j += 2;

			// Skip whitespace
			while (j < code.length && (code[j] === ' ' || code[j] === '\t' || code[j] === '\n')) {
				j++;
			}

			// Read start expression (up to '..')
			const rangeStart = j;
			while (j < code.length && !(code[j] === '.' && code[j + 1] === '.')) {
				j++;
			}
			const startExpr = code.substring(rangeStart, j).trim();

			// Skip '..'
			j += 2;

			// Read end expression (up to ')')
			const endStart = j;
			while (j < code.length && code[j] !== ')') {
				j++;
			}
			const endExpr = code.substring(endStart, j).trim();

			// Skip ')'
			j++;

			// Skip whitespace
			while (j < code.length && (code[j] === ' ' || code[j] === '\t' || code[j] === '\n')) {
				j++;
			}

			// Read body
			let body: string;
			if (code[j] === '{') {
				// Block body
				let depth = 1;
				j++;
				const bodyStart = j;
				while (j < code.length && depth > 0) {
					if (code[j] === '{') {
						depth++;
					} else if (code[j] === '}') {
						depth--;
					}
					if (depth > 0) {
						j++;
					}
				}
				body = code.substring(bodyStart, j);
				j++; // skip closing }
			} else {
				// Single statement body (up to semicolon)
				const bodyStart = j;
				while (j < code.length && code[j] !== ';') {
					j++;
				}
				body = code.substring(bodyStart, j);
			}

			// Generate JavaScript for loop
			const jsFor = `for (let ${varName} = ${startExpr}; ${varName} < ${endExpr}; ${varName}++) { ${body} }`;
			result += jsFor;
			i = j;
			continue;
		}

		result += code[i];
		i++;
	}

	return result;
}

function replaceIfExpressions(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (isKeywordAt(code, i, 'if')) {
			const parsed = parseIfExpression(code, i);
			if (parsed !== undefined) {
				// Recursively process branches first
				const processedThen = replaceIfExpressions(parsed.thenBranch);
				const processedElse = replaceIfExpressions(parsed.elseBranch);

				// Check if branches are blocks (start with '{')
				const thenIsBlock = processedThen.trim().startsWith('{');
				const elseIsBlock = processedElse.trim().startsWith('{');

				// If either branch is a block, keep as statement
				if (thenIsBlock || elseIsBlock) {
					result += code[i];
					i++;
					continue;
				}

				// Check if there's a return/yield inside - if so, don't convert to ternary
				// (it's a statement, not an expression)
				const hasStatement = (branch: string): boolean => {
					return (
						branch.includes('return') ||
						branch.includes('yield') ||
						branch.includes(';')
					);
				};

				if (hasStatement(processedThen) || hasStatement(processedElse)) {
					result += code[i];
					i++;
					continue;
				}

				// Convert to ternary
				const ternary = `((${parsed.condition}) ? (${processedThen}) : (${processedElse}))`;
				result += ternary;
				i = parsed.endIdx;
				continue;
			}
		}

		result += code[i];
		i++;
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
 * Validates constant arithmetic expressions by evaluating them.
 * This is "constant folding" - a standard compiler optimization.
 * Only evaluates expressions containing only literals and operators,
 * no variables or blocks with variable bindings.
 */
function validateConstantExpressions(code: string): Result<void> {
	// Skip code containing read<>, let bindings, or other features
	if (code.includes('read<') || code.includes('let ')) {
		return ok(undefined as void);
	}

	// Try to evaluate the expression - if it succeeds, we can validate type constraints
	const emptyContext = { bindings: [], modules: {}, globalBindings: {}, globalModules: {} };
	const evalResult = interpretInternal(code, emptyContext);

	// If evaluation failed, propagate the error (arithmetic overflow, division by zero, etc.)
	if (evalResult.type === 'err') {
		return evalResult;
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
	const numericValidation = validateNumericLiterals(input);
	if (numericValidation.type === 'err') {
		return err(numericValidation.error);
	}

	// Validate constant arithmetic expressions (constant folding)
	const constantValidation = validateConstantExpressions(input);
	if (constantValidation.type === 'err') {
		return err(constantValidation.error);
	}

	// Treat top-level code as a block by wrapping in braces
	const wrappedInput = `{ ${input} }`;
	let jsCode = compileBracedExpressionsToIife(stripLetTypeAnnotations(wrappedInput));

	// Replace yield with return (before if-expression conversion)
	jsCode = replaceYieldWithReturn(jsCode);

	// Replace for loops (before if-expression conversion)
	jsCode = replaceForLoops(jsCode);

	// Replace if expressions with ternary operators
	jsCode = replaceIfExpressions(jsCode);

	// Replace boolean literals (true -> 1, false -> 0)
	jsCode = replaceBooleans(jsCode);

	// Strip type suffixes from numeric literals (100U8 -> 100)
	jsCode = stripTypeSuffixes(jsCode);

	// Replace read<T>() calls with JavaScript code to read from stdin
	jsCode = replaceReadCalls(jsCode);

	// Wrap to capture the result value and output it for the runner to parse
	const usesStdin = input.includes('read<');
	jsCode = wrapCompiledCode(jsCode, usesStdin);

	return ok(jsCode);
}
