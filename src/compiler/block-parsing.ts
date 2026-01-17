import { isKeywordAt } from './compiler-utils';

export function isWhitespace(ch: string): boolean {
	return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

export function findMatchingBrace(code: string, openIndex: number): number | undefined {
	let depth = 0;
	let i = openIndex;
	while (i < code.length) {
		const ch = code[i];
		if (ch === '{') {
			depth = depth + 1;
			i = i + 1;
			continue;
		}
		if (ch !== '}') {
			i = i + 1;
			continue;
		}
		depth = depth - 1;
		if (depth === 0) {
			return i;
		}
		i = i + 1;
	}
	return undefined;
}

export function skipToMatchingParen(block: string, startIdx: number): number {
	let j = startIdx;
	let depth = 1;
	j += 1;
	while (j < block.length && depth > 0) {
		if (block[j] === '(') {
			depth += 1;
		} else if (block[j] === ')') {
			depth -= 1;
		}
		j += 1;
	}
	return j;
}

export function skipToMatchingBrace(block: string, startIdx: number): number {
	let j = startIdx;
	let depth = 1;
	j += 1;
	while (j < block.length && depth > 0) {
		if (block[j] === '{') {
			depth += 1;
		} else if (block[j] === '}') {
			depth -= 1;
		}
		j += 1;
	}
	return j;
}

export function skipWhitespaceInBlock(block: string, startIdx: number): number {
	let j = startIdx;
	while (j < block.length && isWhitespace(block[j])) {
		j += 1;
	}
	return j;
}

function parseControlFlowBody(block: string, startIdx: number): number {
	let j = startIdx;
	if (j < block.length && block[j] === '{') {
		return skipToMatchingBrace(block, j);
	}
	while (j < block.length && block[j] !== ';' && !isKeywordAt(block, j, 'else')) {
		j += 1;
	}
	if (j < block.length && block[j] === ';') {
		j += 1;
	}
	return j;
}

function parseControlFlowParensAndBody(block: string, startIdx: number): number {
	let j = skipWhitespaceInBlock(block, startIdx);
	if (j < block.length && block[j] === '(') {
		j = skipToMatchingParen(block, j);
	}
	j = skipWhitespaceInBlock(block, j);
	return parseControlFlowBody(block, j);
}

function parseElseChain(block: string, startIdx: number): number {
	let j = startIdx;
	while (j < block.length && isWhitespace(block[j])) {
		j += 1;
	}
	if (!isKeywordAt(block, j, 'else')) {
		return j;
	}
	j += 4;
	j = skipWhitespaceInBlock(block, j);
	if (isKeywordAt(block, j, 'if')) {
		j += 2;
		j = parseControlFlowParensAndBody(block, j);
		return parseElseChain(block, j);
	}
	if (j < block.length && block[j] === '{') {
		return skipToMatchingBrace(block, j);
	}
	while (j < block.length && block[j] !== ';') {
		j += 1;
	}
	if (j < block.length && block[j] === ';') {
		j += 1;
	}
	return j;
}

function parseControlFlowStatement(block: string, startIdx: number): number {
	const i = startIdx;
	let keywordLen = 2;
	if (isKeywordAt(block, i, 'while') || isKeywordAt(block, i, 'match')) {
		keywordLen = 5;
	} else if (isKeywordAt(block, i, 'for')) {
		keywordLen = 3;
	}
	let j = i + keywordLen;
	j = parseControlFlowParensAndBody(block, j);
	if (isKeywordAt(block, i, 'if')) {
		j = parseElseChain(block, j);
	}
	return j;
}

function isAtControlFlowKeyword(block: string, i: number): boolean {
	return (
		isKeywordAt(block, i, 'if') ||
		isKeywordAt(block, i, 'while') ||
		isKeywordAt(block, i, 'for') ||
		isKeywordAt(block, i, 'match')
	);
}

interface SplitterState {
	parenDepth: number;
	braceDepth: number;
	bracketDepth: number;
}

function updateSplitterDepths(state: SplitterState, ch: string): void {
	if (ch === '(') {
		state.parenDepth += 1;
	} else if (ch === ')') {
		state.parenDepth -= 1;
	} else if (ch === '{') {
		state.braceDepth += 1;
	} else if (ch === '}') {
		state.braceDepth -= 1;
	} else if (ch === '[') {
		state.bracketDepth += 1;
	} else if (ch === ']') {
		state.bracketDepth -= 1;
	}
}

function isAtTopLevel(state: SplitterState): boolean {
	return state.parenDepth === 0 && state.braceDepth === 0 && state.bracketDepth === 0;
}

export function splitTopLevelStatements(block: string): string[] {
	const parts: string[] = [];
	let start = 0;
	const state: SplitterState = { parenDepth: 0, braceDepth: 0, bracketDepth: 0 };
	let i = 0;

	while (i < block.length) {
		const ch = block[i];
		if (isAtTopLevel(state) && isAtControlFlowKeyword(block, i)) {
			const j = parseControlFlowStatement(block, i);
			parts.push(block.substring(start, j).trim());
			start = j;
			i = j;
			continue;
		}
		updateSplitterDepths(state, ch);
		if (ch === ';' && isAtTopLevel(state)) {
			parts.push(block.substring(start, i).trim());
			start = i + 1;
		}
		i += 1;
	}
	parts.push(block.substring(start).trim());
	return parts.filter((p): boolean => p.length > 0);
}
