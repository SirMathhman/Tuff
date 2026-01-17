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

	const assignmentInLetResult = validateNoAssignmentInLetInitializer(code);
	if (assignmentInLetResult.type === 'err') {
		return assignmentInLetResult;
	}

	return checkAssignmentMutability(code, mutVars);
}

function skipLetDeclarationInAssignmentCheck(str: string, startIdx: number): number {
	let i = startIdx;
	let depth = 0;
	while (i < str.length) {
		if (str[i] === '{') {
			depth += 1;
		} else if (str[i] === '}') {
			depth -= 1;
		} else if (str[i] === ';' && depth === 0) {
			return i + 1;
		}
		i += 1;
	}
	return i;
}

function isAssignmentEquals(str: string, i: number): boolean {
	const notPrecededByComparison =
		i === 0 || (str[i - 1] !== '!' && str[i - 1] !== '<' && str[i - 1] !== '>');
	const notFollowedByEqualsOrArrow =
		i + 1 >= str.length || (str[i + 1] !== '=' && str[i + 1] !== '>');
	return str[i] === '=' && notPrecededByComparison && notFollowedByEqualsOrArrow;
}

function hasAssignmentOperator(str: string): boolean {
	let i = 0;
	while (i < str.length) {
		// Skip 'let' declarations (their '=' is not an assignment)
		if (isKeywordAt(str, i, 'let')) {
			i = skipLetDeclarationInAssignmentCheck(str, i);
			continue;
		}

		if (isAssignmentEquals(str, i)) {
			return true;
		}
		i += 1;
	}
	return false;
}

function skipMutKeyword(code: string, startIdx: number): number {
	let i = startIdx;
	i = skipWhitespace(code, i);
	if (isKeywordAt(code, i, 'mut')) {
		i += 3;
		i = skipWhitespace(code, i);
	}
	return i;
}

function skipVariableName(code: string, startIdx: number): number {
	let i = startIdx;
	while (i < code.length && isCharIdentifier(code[i])) {
		i += 1;
	}
	return skipWhitespace(code, i);
}

function skipTypeAnnotation(code: string, startIdx: number): number {
	let i = startIdx;
	if (i < code.length && code[i] === ':') {
		i += 1;
		while (i < code.length && code[i] !== '=' && code[i] !== ';') {
			i += 1;
		}
	}
	return i;
}

function findInitializerEnd(code: string, startIdx: number): number {
	let i = startIdx;
	let depth = 0;
	while (i < code.length) {
		if (code[i] === '{' || code[i] === '(' || code[i] === '[') {
			depth += 1;
		} else if (code[i] === '}' || code[i] === ')' || code[i] === ']') {
			depth -= 1;
		} else if (code[i] === ';' && depth === 0) {
			break;
		}
		i += 1;
	}
	return i;
}

function extractLetInitializer(code: string, letStart: number): string | undefined {
	let i = letStart + 3;
	i = skipMutKeyword(code, i);
	i = skipVariableName(code, i);
	i = skipTypeAnnotation(code, i);

	// Find '='
	if (i >= code.length || code[i] !== '=') {
		return undefined;
	}
	if (i + 1 < code.length && code[i + 1] === '>') {
		return undefined; // Function arrow, not assignment
	}

	i += 1;
	i = skipWhitespace(code, i);
	const valueStart = i;
	const valueEnd = findInitializerEnd(code, i);

	return code.substring(valueStart, valueEnd);
}

function isBlockExpression(str: string): boolean {
	const trimmed = str.trim();
	if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
		return false;
	}
	// Check if braces are balanced
	let depth = 0;
	for (let i = 0; i < trimmed.length; i += 1) {
		if (trimmed[i] === '{') {
			depth += 1;
		} else if (trimmed[i] === '}') {
			depth -= 1;
		}
	}
	return depth === 0;
}

function checkInitializerForAssignment(initializer: string | undefined): Result<void> {
	if (initializer === undefined) {
		return ok(undefined as void);
	}
	if (!hasAssignmentOperator(initializer)) {
		return ok(undefined as void);
	}
	// Allow if it's a braced expression
	if (isBlockExpression(initializer)) {
		return ok(undefined as void);
	}
	return err('Assignment not allowed in variable initializer');
}

function validateNoAssignmentInLetInitializer(code: string): Result<void> {
	let i = 0;
	while (i < code.length) {
		if (!isKeywordAt(code, i, 'let')) {
			i += 1;
			continue;
		}

		const initializer = extractLetInitializer(code, i);
		const result = checkInitializerForAssignment(initializer);
		if (result.type === 'err') {
			return result;
		}

		i += 1;
	}
	return ok(undefined as void);
}
