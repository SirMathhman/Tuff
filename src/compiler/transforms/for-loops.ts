import { isKeywordAt, parseIdentifier, skipBraces, skipWhitespaceInCode } from '../compiler-utils';

interface ForLoopHeader {
	varName: string;
	startExpr: string;
	endExpr: string;
	nextIdx: number;
}

interface ForLoopBodyParts {
	body: string;
	nextIdx: number;
}

interface ForLoopVarAndRange {
	varName: string;
	startExpr: string;
	endExpr: string;
	nextIdx: number;
}

function parseForLoopVarAndRange(code: string, startIdx: number): ForLoopVarAndRange | undefined {
	let j = skipWhitespaceInCode(code, startIdx);

	if (isKeywordAt(code, j, 'mut')) {
		j += 3;
		j = skipWhitespaceInCode(code, j);
	}

	const varName = parseIdentifier(code, j);
	j += varName.length;
	j = skipWhitespaceInCode(code, j);

	if (!isKeywordAt(code, j, 'in')) {
		return undefined;
	}
	j += 2;
	j = skipWhitespaceInCode(code, j);

	const rangeStart = j;
	while (j < code.length && !(code[j] === '.' && code[j + 1] === '.')) {
		j += 1;
	}
	const startExpr = code.substring(rangeStart, j).trim();

	j += 2;
	const endStart = j;
	while (j < code.length && code[j] !== ')') {
		j += 1;
	}
	const endExpr = code.substring(endStart, j).trim();
	j += 1;

	return { varName, startExpr, endExpr, nextIdx: j };
}

function parseForLoopHeader(code: string, startIdx: number): ForLoopHeader | undefined {
	let j = startIdx + 3;
	j = skipWhitespaceInCode(code, j);

	if (j >= code.length || code[j] !== '(') {
		return undefined;
	}
	j += 1;
	j = skipWhitespaceInCode(code, j);

	if (!isKeywordAt(code, j, 'let')) {
		return undefined;
	}
	j += 3;

	const result = parseForLoopVarAndRange(code, j);
	if (!result) {
		return undefined;
	}

	return {
		varName: result.varName,
		startExpr: result.startExpr,
		endExpr: result.endExpr,
		nextIdx: result.nextIdx,
	};
}

function extractForLoopBody(code: string, startIdx: number): ForLoopBodyParts {
	let j = skipWhitespaceInCode(code, startIdx);

	if (j < code.length && code[j] === '{') {
		const bodyStart = j + 1;
		j = skipBraces(code, j);
		const body = code.substring(bodyStart, j - 1);
		return { body, nextIdx: j };
	}

	const bodyStart = j;
	while (j < code.length && code[j] !== ';') {
		j += 1;
	}
	return { body: code.substring(bodyStart, j), nextIdx: j };
}

interface ForLoopReplacement {
	text: string;
	nextIdx: number;
}

function tryReplaceForLoopAt(code: string, idx: number): ForLoopReplacement | undefined {
	const header = parseForLoopHeader(code, idx);
	if (header === undefined) {
		return undefined;
	}

	const { body, nextIdx } = extractForLoopBody(code, header.nextIdx);
	const jsFor = `for (let ${header.varName} = ${header.startExpr}; ${header.varName} < ${header.endExpr}; ${header.varName}++) { ${body} }`;
	return { text: jsFor, nextIdx };
}

export function replaceForLoops(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (!isKeywordAt(code, i, 'for')) {
			result += code[i];
			i += 1;
			continue;
		}

		const replacement = tryReplaceForLoopAt(code, i);
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
