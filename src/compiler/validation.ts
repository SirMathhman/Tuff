import { err, ok, type Result } from '../common/result';
import { hasNegativeSign, validateValueForType } from '../common/types';
import { interpretInternal } from '../interpreter/evaluator';
import { isKeywordAt } from './compiler-utils';
import { isNumericStart, processNumericToken, type NumericToken } from './numeric-tokens';

interface LiteralProcessResult {
	token: NumericToken;
	nextIdx: number;
	error?: Result<never>;
}

function validateTypedLiteral(
	fullLiteral: string,
	typeSuffix: string,
	digits: string,
): Result<void> {
	if (hasNegativeSign(digits)) {
		const isUnsigned = typeSuffix.startsWith('U');
		if (isUnsigned) {
			return err('Negative numbers are not supported for unsigned types');
		}
	}

	const value = Number.parseInt(digits, 10);
	if (Number.isNaN(value)) {
		return err(`Invalid number literal: ${fullLiteral}`);
	}

	const validation = validateValueForType(value, typeSuffix);
	if (validation.type === 'err') {
		return validation;
	}

	return ok(undefined as void);
}

function processLiteralAtPosition(code: string, idx: number): LiteralProcessResult {
	const token = processNumericToken(code, idx);
	const fullLiteral = code.substring(idx, idx + token.consumed);

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
export function validateNumericLiterals(code: string): Result<void> {
	let i = 0;

	while (i < code.length) {
		if (!isNumericStart(code, i)) {
			i += 1;
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
export function validateConstantExpressions(code: string): Result<void> {
	const skipMarkers = [
		'read<',
		'let ',
		'fn ',
		'struct ',
		'enum ',
		'module ',
		'match ',
		'for ',
		'if ',
		';',
		'{',
		'}',
	];
	for (const marker of skipMarkers) {
		if (code.includes(marker)) {
			return ok(undefined as void);
		}
	}

	const emptyContext = { bindings: [], modules: {}, globalBindings: {}, globalModules: {} };
	const evalResult = interpretInternal(code, emptyContext);
	if (evalResult.type === 'err') {
		return evalResult;
	}

	return ok(undefined as void);
}

function isCharIdentifier(c: string): boolean {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_';
}

function skipLetDeclaration(code: string, startIdx: number): number {
	let idx = startIdx;
	while (idx < code.length && code[idx] !== ';' && code[idx] !== '}') {
		idx += 1;
	}
	if (idx < code.length && code[idx] === ';') {
		idx += 1;
	}
	return idx;
}

function isValidVarName(varName: string): boolean {
	if (varName.length === 0 || varName === 'this') {
		return false;
	}

	const firstChar = varName[0];
	const validStart =
		(firstChar >= 'a' && firstChar <= 'z') ||
		(firstChar >= 'A' && firstChar <= 'Z') ||
		firstChar === '_';
	if (!validStart) {
		return false;
	}

	for (let i = 1; i < varName.length; i += 1) {
		const c = varName[i];
		const valid =
			(c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_';
		if (!valid) {
			return false;
		}
	}

	return true;
}

function skipWhitespace(code: string, startIdx: number): number {
	let idx = startIdx;
	while (idx < code.length && (code[idx] === ' ' || code[idx] === '\t' || code[idx] === '\n')) {
		idx += 1;
	}
	return idx;
}

function extractVarName(code: string, i: number): string {
	let j = i;
	while (j < code.length && isCharIdentifier(code[j])) {
		j += 1;
	}
	return code.substring(i, j);
}

function processLetBinding(code: string, startIdx: number, mutVars: Set<string>): void {
	let j = startIdx + 3;
	j = skipWhitespace(code, j);

	let isMut = false;
	if (isKeywordAt(code, j, 'mut')) {
		isMut = true;
		j += 3;
		j = skipWhitespace(code, j);
	}

	const varName = extractVarName(code, j);
	if (varName.length === 0) {
		return;
	}

	j += varName.length;
	j = skipWhitespace(code, j);

	if (j < code.length && code[j] === ':') {
		j += 1;
		j = skipWhitespace(code, j);
		const typeName = extractVarName(code, j);
		j += typeName.length;
		j = skipWhitespace(code, j);

		if (j >= code.length || code[j] !== '=') {
			isMut = true;
		}
	}

	if (isMut) {
		mutVars.add(varName);
	}
}

function processForLoop(code: string, startIdx: number, mutVars: Set<string>): void {
	let j = startIdx + 3;
	j = skipWhitespace(code, j);

	if (j >= code.length || code[j] !== '(') {
		return;
	}

	j += 1;
	j = skipWhitespace(code, j);

	if (!isKeywordAt(code, j, 'let')) {
		return;
	}

	j += 3;
	j = skipWhitespace(code, j);

	if (isKeywordAt(code, j, 'mut')) {
		j += 3;
		j = skipWhitespace(code, j);
	}

	const varName = extractVarName(code, j);
	if (varName.length > 0) {
		mutVars.add(varName);
	}
}

function collectMutableVariables(code: string): Set<string> {
	const mutVars = new Set<string>();
	let i = 0;

	while (i < code.length) {
		if (isKeywordAt(code, i, 'let')) {
			processLetBinding(code, i, mutVars);
		} else if (isKeywordAt(code, i, 'for')) {
			processForLoop(code, i, mutVars);
		}
		i += 1;
	}

	return mutVars;
}

function extractVariableNameBeforeAssignment(code: string, assignmentIdx: number): string {
	let j = assignmentIdx - 1;
	while (j >= 0 && (code[j] === ' ' || code[j] === '\t' || code[j] === '\n')) {
		j -= 1;
	}

	const varEnd = j + 1;
	while (j >= 0 && isCharIdentifier(code[j])) {
		j -= 1;
	}

	return code.substring(j + 1, varEnd);
}

function isAssignmentOperator(code: string, idx: number): boolean {
	const isEqualSign = code[idx] === '=';
	const nextIsEqual = idx + 1 < code.length && code[idx + 1] === '=';
	const nextIsArrow = idx + 1 < code.length && code[idx + 1] === '>';
	const prevIsOp =
		idx > 0 && (code[idx - 1] === '!' || code[idx - 1] === '<' || code[idx - 1] === '>');

	return isEqualSign && !nextIsEqual && !nextIsArrow && !prevIsOp;
}

function processAssignmentCheck(code: string, idx: number, mutVars: Set<string>): Result<void> {
	if (!isAssignmentOperator(code, idx)) {
		return ok(undefined as void);
	}

	const varName = extractVariableNameBeforeAssignment(code, idx);
	if (isValidVarName(varName) && !mutVars.has(varName)) {
		return err(`Variable '${varName}' is not mutable`);
	}

	return ok(undefined as void);
}

function checkAssignmentMutability(code: string, mutVars: Set<string>): Result<void> {
	let idx = 0;

	while (idx < code.length) {
		if (isKeywordAt(code, idx, 'let')) {
			idx = skipLetDeclaration(code, idx);
			continue;
		}

		const result = processAssignmentCheck(code, idx, mutVars);
		if (result.type === 'err') {
			return result;
		}

		idx += 1;
	}

	return ok(undefined as void);
}

export function validateMutability(code: string): Result<void> {
	const mutVars = collectMutableVariables(code);
	return checkAssignmentMutability(code, mutVars);
}
