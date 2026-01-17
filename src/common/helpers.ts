import { err, type Result } from './result';
import {
	type IfStatementBranches,
	type TypeAnnotationParts,
	type VariableDeclarationParts,
	findClosingBrace,
	findClosingParen,
	findSemicolonOutsideBrackets,
	isVariableName,
	findCharOutsideBrackets,
} from './types';

/**
 * Checks if 'if' keyword starts at the given position.
 */
function isIfKeywordAt(input: string, i: number): boolean {
	if (input.substring(i, i + 2) !== 'if') {
		return false;
	}
	let beforeChar = ' ';
	if (i > 0) {
		beforeChar = input[i - 1];
	}
	let afterChar = ' ';
	if (i + 2 < input.length) {
		afterChar = input[i + 2];
	}
	const isWordBoundaryBefore = beforeChar === ' ' || beforeChar === '\t';
	const isWordBoundaryAfter = afterChar === ' ' || afterChar === '\t' || afterChar === '(';
	return isWordBoundaryBefore && isWordBoundaryAfter;
}

/**
 * Checks if 'else' keyword starts at the given position.
 */
function isElseKeywordAt(input: string, i: number): boolean {
	if (input.substring(i, i + 4) !== 'else') {
		return false;
	}
	let beforeChar = ' ';
	if (i > 0) {
		beforeChar = input[i - 1];
	}
	let afterChar = ' ';
	if (i + 4 < input.length) {
		afterChar = input[i + 4];
	}
	const isWordBoundaryBefore = beforeChar === ' ' || beforeChar === '\t';
	const isWordBoundaryAfter = afterChar === ' ' || afterChar === '\t';
	return isWordBoundaryBefore && isWordBoundaryAfter;
}

/**
 * Finds the index of the else keyword at depth 0 (not inside parens/braces).
 */
export function findElseKeywordIndex(input: string): number {
	let bracketDepth = 0;
	let parenDepth = 0;
	let ifDepth = 0;
	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		if (char === '(') {
			parenDepth++;
			continue;
		}
		if (char === ')') {
			parenDepth--;
			continue;
		}
		if (char === '{') {
			bracketDepth++;
			continue;
		}
		if (char === '}') {
			bracketDepth--;
			continue;
		}

		const inBrackets = parenDepth > 0 || bracketDepth > 0;
		if (inBrackets) {
			continue;
		}

		if (isIfKeywordAt(input, i)) {
			ifDepth++;
		} else if (isElseKeywordAt(input, i) && ifDepth === 0) {
			return i;
		} else if (isElseKeywordAt(input, i)) {
			ifDepth--;
		}
	}

	return -1;
}

/**
 * Parsed if condition and what comes after.
 */
export interface IfConditionAndAfter {
	conditionStr: string;
	afterCondition: string;
}

/**
 * Extracts condition string and remaining text from after-if string.
 */
export function extractIfConditionAndAfter(afterIf: string): IfConditionAndAfter | undefined {
	if (!afterIf.startsWith('(')) {
		return undefined;
	}

	const conditionEnd = findClosingParen(afterIf);
	if (conditionEnd < 0) {
		return undefined;
	}

	const conditionStr = afterIf.substring(1, conditionEnd);
	const afterCondition = afterIf.substring(conditionEnd + 1).trim();
	return { conditionStr, afterCondition };
}

/**
 * Checks if a trimmed string is an if statement.
 */
export function isIfStatement(trimmed: string): boolean {
	if (!trimmed.startsWith('if ')) {
		return false;
	}

	const afterIf = trimmed.substring(3).trim();
	if (!afterIf.startsWith('(')) {
		return false;
	}

	const conditionEnd = findClosingParen(afterIf);
	if (conditionEnd < 0) {
		return false;
	}

	const afterCondition = afterIf.substring(conditionEnd + 1).trim();
	if (afterCondition.length === 0) {
		return false;
	}

	const elseIndex = findElseKeywordIndex(afterCondition);
	if (elseIndex >= 0) {
		const trueStatementStr = afterCondition.substring(0, elseIndex).trim();
		const falseStatementStr = afterCondition.substring(elseIndex + 4).trim();

		const isTrueBraced = trueStatementStr.startsWith('{');
		const isFalseBraced = falseStatementStr.startsWith('{');
		const trueSemiIndex = findSemicolonOutsideBrackets(trueStatementStr);
		const falseSemiIndex = findSemicolonOutsideBrackets(falseStatementStr);

		const bothSemicolons = trueSemiIndex >= 0 && falseSemiIndex >= 0;
		const bothBraced = isTrueBraced && isFalseBraced;

		return bothSemicolons || bothBraced;
	}

	const isBraced = afterCondition.startsWith('{');
	const semiIndex = findSemicolonOutsideBrackets(afterCondition);

	return isBraced || semiIndex >= 0;
}

/**
 * Extracts the if-statement branches.
 */
export function extractIfStatementBranches(
	afterCondition: string,
): IfStatementBranches | undefined {
	const elseIndex = findElseKeywordIndex(afterCondition);

	if (elseIndex < 0) {
		const trueStatementStr = afterCondition.trim();
		if (trueStatementStr.length === 0) {
			return undefined;
		}
		return { trueStatementStr, falseStatementStr: undefined };
	}

	const trueStatementStr = afterCondition.substring(0, elseIndex).trim();
	const falseStatementStr = afterCondition.substring(elseIndex + 4).trim();

	if (trueStatementStr.length === 0 || falseStatementStr.length === 0) {
		return undefined;
	}

	return { trueStatementStr, falseStatementStr };
}

/**
 * Extracts the remaining text after a statement (handles braced blocks and semicolons).
 */
export function extractRemainingFromStatement(statementStr: string): string {
	if (statementStr.startsWith('{')) {
		const closingBraceIndex = findClosingBrace(statementStr);
		if (closingBraceIndex < 0) {
			return '';
		}
		let remaining = statementStr.substring(closingBraceIndex + 1).trim();
		if (remaining.startsWith(';')) {
			remaining = remaining.substring(1).trim();
		}
		return remaining;
	}
	const semiIndex = findSemicolonOutsideBrackets(statementStr);
	if (semiIndex >= 0) {
		return statementStr.substring(semiIndex + 1).trim();
	}
	return '';
}

/**
 * Strips a single leading semicolon (if present) and surrounding whitespace.
 */
export function stripLeadingSemicolon(input: string): string {
	let remaining = input.trim();
	if (remaining.startsWith(';')) {
		remaining = remaining.substring(1).trim();
	}
	return remaining;
}

/**
 * Parses the type annotation and assignment part after a colon.
 */
/**
 * Find the first '=' that is not part of '=>' and not inside brackets.
 */
function findAssignmentEqualOutsideBrackets(input: string): number {
	let bracketDepth = 0;
	let parenDepth = 0;
	let squareBracketDepth = 0;
	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		if (char === '(') {
			parenDepth++;
		} else if (char === ')') {
			parenDepth--;
		} else if (char === '{') {
			bracketDepth++;
		} else if (char === '}') {
			bracketDepth--;
		} else if (char === '[') {
			squareBracketDepth++;
		} else if (char === ']') {
			squareBracketDepth--;
		} else if (
			char === '=' &&
			bracketDepth === 0 &&
			parenDepth === 0 &&
			squareBracketDepth === 0 &&
			input[i + 1] !== '>'
		) {
			return i;
		}
	}
	return -1;
}

export function parseTypeAnnotationPart(afterColon: string): TypeAnnotationParts {
	const semiIndex = findSemicolonOutsideBrackets(afterColon);
	let searchForEqual: string;
	if (semiIndex >= 0) {
		searchForEqual = afterColon.substring(0, semiIndex);
	} else {
		searchForEqual = afterColon;
	}

	const equalIndex = findAssignmentEqualOutsideBrackets(searchForEqual);

	if (equalIndex >= 0) {
		const typeAnnotation = searchForEqual.substring(0, equalIndex).trim();
		let afterTypeOrName = searchForEqual.substring(equalIndex);
		if (semiIndex >= 0) {
			afterTypeOrName += afterColon.substring(semiIndex);
		}
		return { typeAnnotation, afterTypeOrName };
	}

	const typeAnnotation = searchForEqual.trim();
	return { typeAnnotation, afterTypeOrName: '' };
}

/**
 * Parses variable declaration header (mut flag, name, type annotation).
 */
export function parseVariableDeclarationHeader(
	withoutLet: string,
): Result<VariableDeclarationParts> {
	let isMutable = false;
	let remaining = withoutLet;

	if (withoutLet.startsWith('mut ')) {
		isMutable = true;
		remaining = withoutLet.substring(4).trim();
	}

	const colonIndex = findCharOutsideBrackets(remaining, ':');
	let varName: string;
	let typeAnnotation: string | undefined;
	let afterTypeOrName: string;

	if (colonIndex >= 0) {
		varName = remaining.substring(0, colonIndex).trim();
		const afterColon = remaining.substring(colonIndex + 1).trim();
		const parts = parseTypeAnnotationPart(afterColon);
		typeAnnotation = parts.typeAnnotation;
		afterTypeOrName = parts.afterTypeOrName;
	} else {
		const equalIndex = findCharOutsideBrackets(remaining, '=');
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

	return { type: 'ok', value: { varName, isMutable, typeAnnotation, afterTypeOrName } };
}
