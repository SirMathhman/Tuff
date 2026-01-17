import { isKeywordAt, skipWhitespaceInCode } from '../compiler-utils';

interface MatchCase {
	pattern: string;
	result: string;
}

interface MatchCaseResult {
	matchCase: MatchCase;
	nextIdx: number;
}

interface PatternParseResult {
	pattern: string;
	nextIdx: number;
}

interface ResultParseResult {
	result: string;
	nextIdx: number;
}

interface MatchCasesInfo {
	cases: MatchCase[];
	nextIdx: number;
}

interface MatchExpressionContent {
	matchExpr: string;
	casesInfo: MatchCasesInfo;
}

function parseMatchCasePattern(code: string, startIdx: number): PatternParseResult | undefined {
	let j = startIdx;
	while (j < code.length && (code[j] === ' ' || code[j] === '\t' || code[j] === '\n')) {
		j += 1;
	}

	if (j >= code.length || !isKeywordAt(code, j, 'case')) {
		return undefined;
	}

	j += 4;
	while (j < code.length && (code[j] === ' ' || code[j] === '\t' || code[j] === '\n')) {
		j += 1;
	}

	const patternStart = j;
	while (j < code.length && !(code[j] === '=' && code[j + 1] === '>')) {
		j += 1;
	}
	const pattern = code.substring(patternStart, j).trim();

	j += 2;
	while (j < code.length && (code[j] === ' ' || code[j] === '\t' || code[j] === '\n')) {
		j += 1;
	}

	return { pattern, nextIdx: j };
}

function parseMatchCaseResult(code: string, startIdx: number): ResultParseResult {
	let j = startIdx;
	let depth = 0;

	while (j < code.length) {
		if (code[j] === '{') {
			depth += 1;
		} else if (code[j] === '}' && depth === 0) {
			break;
		} else if (code[j] === '}') {
			depth -= 1;
		} else if (code[j] === ';' && depth === 0) {
			break;
		}
		j += 1;
	}

	if (j < code.length && code[j] === ';') {
		j += 1;
	}

	const result = code.substring(startIdx, j).trim();
	return { result, nextIdx: j };
}

function parseMatchCase(code: string, startIdx: number): MatchCaseResult | undefined {
	const patternResult = parseMatchCasePattern(code, startIdx);
	if (!patternResult) {
		return undefined;
	}

	const resultInfo = parseMatchCaseResult(code, patternResult.nextIdx);
	return {
		matchCase: { pattern: patternResult.pattern, result: resultInfo.result },
		nextIdx: resultInfo.nextIdx,
	};
}

function buildMatchTernary(matchExpr: string, cases: MatchCase[]): string {
	if (cases.length === 0) {
		return matchExpr;
	}

	let ternary = '(';
	for (let k = 0; k < cases.length; k += 1) {
		const c = cases[k];
		if (c.pattern === '_') {
			ternary += `(${c.result})`;
			continue;
		}
		if (k > 0 && cases[k - 1].pattern !== '_') {
			ternary += ' : ';
		}
		ternary += `((${matchExpr}) === (${c.pattern}) ? (${c.result})`;
	}

	for (let k = 0; k < cases.length - 1; k += 1) {
		if (cases[k].pattern !== '_') {
			ternary += ')';
		}
	}
	ternary += ')';
	return ternary;
}

function parseMatchCases(code: string, startIdx: number): MatchCasesInfo {
	let j = startIdx;
	const cases: MatchCase[] = [];

	while (j < code.length && code[j] !== '}') {
		const nextCase = parseMatchCase(code, j);
		if (nextCase !== undefined) {
			cases.push(nextCase.matchCase);
			j = nextCase.nextIdx;
		} else {
			j += 1;
		}
	}

	return { cases, nextIdx: j };
}

function parseMatchExpressionContent(
	code: string,
	matchIdx: number,
): MatchExpressionContent | undefined {
	let j = matchIdx + 5;
	j = skipWhitespaceInCode(code, j);

	if (j >= code.length || code[j] !== '(') {
		return undefined;
	}

	j += 1;
	const matchExprStart = j;
	let depth = 1;
	while (j < code.length && depth > 0) {
		if (code[j] === '(') {
			depth += 1;
		} else if (code[j] === ')') {
			depth -= 1;
		}
		j += 1;
	}
	const matchExpr = code.substring(matchExprStart, j - 1);

	j = skipWhitespaceInCode(code, j);
	if (j >= code.length || code[j] !== '{') {
		return undefined;
	}

	j += 1;
	const casesInfo = parseMatchCases(code, j);
	if (casesInfo.nextIdx < code.length && code[casesInfo.nextIdx] === '}') {
		casesInfo.nextIdx += 1;
	}

	return { matchExpr, casesInfo };
}

interface MatchReplacement {
	text: string;
	nextIdx: number;
}

function tryReplaceMatchAt(code: string, idx: number): MatchReplacement | undefined {
	const content = parseMatchExpressionContent(code, idx);
	if (content === undefined) {
		return undefined;
	}
	const ternary = buildMatchTernary(content.matchExpr, content.casesInfo.cases);
	return { text: ternary, nextIdx: content.casesInfo.nextIdx };
}

export function replaceMatchExpressions(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (!isKeywordAt(code, i, 'match')) {
			result += code[i];
			i += 1;
			continue;
		}

		const replacement = tryReplaceMatchAt(code, i);
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
