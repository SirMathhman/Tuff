import {
	findElseKeyword,
	findMatchingBrace,
	findMatchingParen,
	isKeywordAt,
	skipWhitespaceInCode,
} from '../compiler-utils';

interface IfParts {
	condition: string;
	thenBranch: string;
	elseBranch: string;
	endIdx: number;
}

interface ConditionParseResult {
	condition: string;
	nextIdx: number;
}

interface BranchParseResult {
	branch: string;
	nextIdx: number;
}

function tryParseBracedBranch(code: string, startIdx: number): BranchParseResult | undefined {
	if (startIdx >= code.length) {
		return undefined;
	}
	if (code[startIdx] !== '{') {
		return undefined;
	}

	const end = findMatchingBrace(code, startIdx);
	const branch = code.substring(startIdx, end).trim();
	return { branch, nextIdx: end };
}

function parseIfCondition(code: string, startIdx: number): ConditionParseResult | undefined {
	let i = startIdx + 2;
	i = skipWhitespaceInCode(code, i);

	if (i >= code.length || code[i] !== '(') {
		return undefined;
	}

	const condStart = i + 1;
	const condEnd = findMatchingParen(code, i);
	if (condEnd === -1) {
		return undefined;
	}

	const condition = code.substring(condStart, condEnd);
	return { condition, nextIdx: condEnd + 1 };
}

function parseIfThenBranch(code: string, startIdx: number): BranchParseResult | undefined {
	const i = skipWhitespaceInCode(code, startIdx);
	if (i >= code.length) {
		return undefined;
	}

	const blockBranch = tryParseBracedBranch(code, i);
	if (blockBranch !== undefined) {
		return blockBranch;
	}

	const elseIdx = findElseKeyword(code, i);
	if (elseIdx === -1) {
		return undefined;
	}
	const branch = code.substring(i, elseIdx).trim();
	return { branch, nextIdx: elseIdx };
}

function parseElseExpressionBranch(code: string, startIdx: number): BranchParseResult {
	let i = startIdx;
	while (i < code.length) {
		const ch = code[i];
		if (ch === ';' || ch === '}' || ch === ')') {
			break;
		}
		i += 1;
	}
	const branch = code.substring(startIdx, i).trim();
	return { branch, nextIdx: i };
}

function parseIfElseBranch(code: string, startIdx: number): BranchParseResult | undefined {
	let i = skipWhitespaceInCode(code, startIdx);
	if (!isKeywordAt(code, i, 'else')) {
		return undefined;
	}
	i += 4;
	i = skipWhitespaceInCode(code, i);
	if (i >= code.length) {
		return undefined;
	}

	const blockBranch = tryParseBracedBranch(code, i);
	if (blockBranch !== undefined) {
		return blockBranch;
	}

	if (isKeywordAt(code, i, 'if')) {
		const nested = parseIfExpression(code, i);
		if (nested === undefined) {
			return undefined;
		}
		return { branch: code.substring(i, nested.endIdx).trim(), nextIdx: nested.endIdx };
	}

	return parseElseExpressionBranch(code, i);
}

function parseIfExpression(code: string, ifIdx: number): IfParts | undefined {
	const condResult = parseIfCondition(code, ifIdx);
	if (!condResult) {
		return undefined;
	}

	const thenResult = parseIfThenBranch(code, condResult.nextIdx);
	if (!thenResult) {
		return undefined;
	}

	const elseResult = parseIfElseBranch(code, thenResult.nextIdx);
	if (!elseResult) {
		return undefined;
	}

	return {
		condition: condResult.condition,
		thenBranch: thenResult.branch,
		elseBranch: elseResult.branch,
		endIdx: elseResult.nextIdx,
	};
}

function hasStatementLikeSyntax(branch: string): boolean {
	return branch.includes('return') || branch.includes('yield') || branch.includes(';');
}

interface IfReplacement {
	text: string;
	nextIdx: number;
}

function tryReplaceIfAt(code: string, idx: number): IfReplacement | undefined {
	const parsed = parseIfExpression(code, idx);
	if (parsed === undefined) {
		return undefined;
	}

	const processedThen = replaceIfExpressions(parsed.thenBranch);
	const processedElse = replaceIfExpressions(parsed.elseBranch);

	const thenIsBlock = processedThen.trim().startsWith('{');
	if (thenIsBlock) {
		return undefined;
	}

	const elseIsBlock = processedElse.trim().startsWith('{');
	if (elseIsBlock) {
		return undefined;
	}

	if (hasStatementLikeSyntax(processedThen) || hasStatementLikeSyntax(processedElse)) {
		return undefined;
	}

	const ternary = `((${parsed.condition}) ? (${processedThen}) : (${processedElse}))`;
	return { text: ternary, nextIdx: parsed.endIdx };
}

export function replaceIfExpressions(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (!isKeywordAt(code, i, 'if')) {
			result += code[i];
			i += 1;
			continue;
		}

		const replacement = tryReplaceIfAt(code, i);
		if (replacement === undefined) {
			result += code[i];
			i += 1;
			continue;
		}

		result += replacement.text;
		i = replacement.nextIdx;
	}

	return result;
}
