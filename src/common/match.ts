import { findClosingBrace, findClosingParen } from './types';

/**
 * Represents a single case in a match expression.
 */
export interface MatchCase {
	pattern: string;
	result: string;
}

/**
 * Represents a parsed match expression.
 */
export interface ParsedMatch {
	matchExpr: string;
	cases: MatchCase[];
}

/**
 * Checks if a string starts with 'match' keyword.
 */
export function isMatchKeyword(input: string): boolean {
	const trimmed = input.trim();
	if (!trimmed.startsWith('match')) {
		return false;
	}

	const afterMatch = trimmed.substring(5);
	const firstChar = afterMatch.charAt(0);
	return firstChar === ' ' || firstChar === '(';
}

/**
 * Extracts match expression and cases from a match string.
 * @param input - The input starting with 'match'
 * @returns ParsedMatch with expression and cases, or undefined if invalid
 */
export function extractMatchExpression(input: string): ParsedMatch | undefined {
	const trimmed = input.trim();

	if (!trimmed.startsWith('match')) {
		return undefined;
	}

	const afterMatch = trimmed.substring(5).trim();

	if (!afterMatch.startsWith('(')) {
		return undefined;
	}

	const exprEnd = findClosingParen(afterMatch);
	if (exprEnd < 0) {
		return undefined;
	}

	const matchExpr = afterMatch.substring(1, exprEnd);
	const afterExpr = afterMatch.substring(exprEnd + 1).trim();

	if (!afterExpr.startsWith('{')) {
		return undefined;
	}

	const blockEnd = findClosingBrace(afterExpr);
	if (blockEnd < 0) {
		return undefined;
	}

	const blockContent = afterExpr.substring(1, blockEnd);
	const cases = parseMatchCases(blockContent);

	if (cases.length === 0) {
		return undefined;
	}

	return { matchExpr, cases };
}

/**
 * Parses match cases from block content.
 * @param blockContent - The content inside { }
 * @returns Array of parsed match cases
 */
export function parseMatchCases(blockContent: string): MatchCase[] {
	const cases: MatchCase[] = [];
	const parts = blockContent.split(';').map((p: string): string => p.trim());

	for (const part of parts) {
		if (part.length === 0) {
			continue;
		}

		if (!part.startsWith('case ')) {
			continue;
		}

		const arrowIdx = part.indexOf('=>');
		if (arrowIdx < 0) {
			continue;
		}

		const beforeArrow = part.substring(5, arrowIdx).trim();
		const result = part.substring(arrowIdx + 2).trim();

		if (beforeArrow.length > 0 && result.length > 0) {
			cases.push({ pattern: beforeArrow, result });
		}
	}

	return cases;
}
