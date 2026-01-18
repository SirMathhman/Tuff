import { err, ok, type Result } from '../common/result';
import {
	findMatchingParen,
	isIdentifierChar,
	isIdentifierStartChar,
	isKeywordAt,
	parseIdentifier,
	skipWhitespaceInCode,
} from './compiler-utils';

export interface FunctionRefTarget {
	functionName: string;
	paramCount: number;
}

export interface ParsedLetFunctionReferenceTarget {
	varName: string;
	target: FunctionRefTarget;
	nextIdx: number;
}

interface DepthCounters {
	parenDepth: number;
	braceDepth: number;
	squareDepth: number;
	angleDepth: number;
}

interface StatementDepth {
	parenDepth: number;
	braceDepth: number;
	squareDepth: number;
}

export function isWhitespace(ch: string): boolean {
	return ch === ' ' || ch === '\t' || ch === '\n';
}

export function previousNonWhitespaceChar(code: string, idx: number): string | undefined {
	let i = idx - 1;
	while (i >= 0 && isWhitespace(code[i])) {
		i -= 1;
	}
	if (i < 0) {
		return undefined;
	}
	return code[i];
}

function nextNonWhitespaceChar(code: string, idx: number): string | undefined {
	let i = idx + 1;
	while (i < code.length && isWhitespace(code[i])) {
		i += 1;
	}
	if (i >= code.length) {
		return undefined;
	}
	return code[i];
}

function shouldOpenGenericAngle(code: string, idx: number): boolean {
	const prev = previousNonWhitespaceChar(code, idx);
	if (prev === undefined) {
		return false;
	}
	const next = nextNonWhitespaceChar(code, idx);
	if (next === undefined) {
		return false;
	}
	if (!isIdentifierChar(prev)) {
		return false;
	}
	if (!isIdentifierStartChar(next)) {
		return false;
	}
	return true;
}

function updateDepthCountersForChar(
	counters: DepthCounters,
	ch: string,
	code: string,
	idx: number,
): boolean {
	if (ch === '(') {
		counters.parenDepth += 1;
		return true;
	}
	if (ch === ')') {
		counters.parenDepth -= 1;
		return true;
	}
	if (ch === '{') {
		counters.braceDepth += 1;
		return true;
	}
	if (ch === '}') {
		counters.braceDepth -= 1;
		return true;
	}
	if (ch === '[') {
		counters.squareDepth += 1;
		return true;
	}
	if (ch === ']') {
		counters.squareDepth -= 1;
		return true;
	}
	if (ch === '<' && shouldOpenGenericAngle(code, idx)) {
		counters.angleDepth += 1;
		return true;
	}
	if (ch === '>' && counters.angleDepth > 0) {
		counters.angleDepth -= 1;
		return true;
	}
	return false;
}

function updateStatementDepth(depth: StatementDepth, ch: string): void {
	if (ch === '(') {
		depth.parenDepth += 1;
		return;
	}
	if (ch === ')') {
		depth.parenDepth -= 1;
		return;
	}
	if (ch === '{') {
		depth.braceDepth += 1;
		return;
	}
	if (ch === '}') {
		depth.braceDepth -= 1;
		return;
	}
	if (ch === '[') {
		depth.squareDepth += 1;
		return;
	}
	if (ch === ']') {
		depth.squareDepth -= 1;
	}
}

function isTopLevelStatementDepth(depth: StatementDepth): boolean {
	return depth.parenDepth === 0 && depth.braceDepth === 0 && depth.squareDepth === 0;
}

export function countCommaSeparatedItems(text: string): number {
	const trimmed = text.trim();
	if (trimmed.length === 0) {
		return 0;
	}

	const counters: DepthCounters = {
		parenDepth: 0,
		braceDepth: 0,
		squareDepth: 0,
		angleDepth: 0,
	};
	let commaCount = 0;

	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];
		if (updateDepthCountersForChar(counters, ch, text, i)) {
			continue;
		}

		const isTopLevel =
			counters.parenDepth === 0 &&
			counters.braceDepth === 0 &&
			counters.squareDepth === 0 &&
			counters.angleDepth === 0;
		if (isTopLevel && ch === ',') {
			commaCount += 1;
		}
	}

	return commaCount + 1;
}

function findMatchingAngle(code: string, openIdx: number): number {
	let depth = 1;
	let i = openIdx + 1;
	while (i < code.length && depth > 0) {
		if (code[i] === '<') {
			depth += 1;
		} else if (code[i] === '>') {
			depth -= 1;
		}
		if (depth === 0) {
			return i;
		}
		i += 1;
	}
	return -1;
}

function skipGenericParams(code: string, idx: number): number {
	if (idx >= code.length || code[idx] !== '<') {
		return idx;
	}
	const closeIdx = findMatchingAngle(code, idx);
	if (closeIdx < 0) {
		return idx;
	}
	return closeIdx + 1;
}

export function collectFunctionParamCounts(code: string): Map<string, number> {
	const paramCounts = new Map<string, number>();
	let i = 0;

	while (i < code.length) {
		if (!isKeywordAt(code, i, 'fn')) {
			i += 1;
			continue;
		}

		let j = i + 2;
		j = skipWhitespaceInCode(code, j);
		const name = parseIdentifier(code, j);
		if (name.length === 0) {
			i += 2;
			continue;
		}

		j += name.length;
		j = skipWhitespaceInCode(code, j);
		j = skipGenericParams(code, j);
		j = skipWhitespaceInCode(code, j);

		if (j >= code.length || code[j] !== '(') {
			i += 2;
			continue;
		}

		const closeParen = findMatchingParen(code, j);
		if (closeParen < 0) {
			i += 2;
			continue;
		}

		const paramsText = code.substring(j + 1, closeParen);
		const paramCount = countCommaSeparatedItems(paramsText);
		paramCounts.set(name, paramCount);

		i = closeParen + 1;
	}

	return paramCounts;
}

function findStatementEnd(code: string, startIdx: number): number {
	const depth: StatementDepth = { parenDepth: 0, braceDepth: 0, squareDepth: 0 };
	let i = startIdx;

	while (i < code.length) {
		const ch = code[i];
		updateStatementDepth(depth, ch);

		if (isTopLevelStatementDepth(depth) && ch === ';') {
			return i;
		}
		i += 1;
	}

	return code.length;
}

function extractTypeAnnotationFromLet(code: string, colonIdx: number): string {
	let i = colonIdx + 1;
	while (i < code.length && isWhitespace(code[i])) {
		i += 1;
	}

	const start = i;
	let parenDepth = 0;
	let squareDepth = 0;

	while (i < code.length) {
		const ch = code[i];
		if (ch === '(') {
			parenDepth += 1;
		} else if (ch === ')') {
			parenDepth -= 1;
		} else if (ch === '[') {
			squareDepth += 1;
		} else if (ch === ']') {
			squareDepth -= 1;
		}

		const isTopLevel = parenDepth === 0 && squareDepth === 0;
		let next: string | undefined;
		if (i + 1 < code.length) {
			next = code[i + 1];
		}
		const isTypeArrow = ch === '=' && next === '>';
		if (isTopLevel && (ch === ';' || (ch === '=' && !isTypeArrow))) {
			break;
		}
		i += 1;
	}

	return code.substring(start, i).trim();
}

function isFunctionTypeAnnotation(typeAnnotation: string): boolean {
	const trimmed = typeAnnotation.trim();
	if (!trimmed.startsWith('(')) {
		return false;
	}
	return trimmed.includes('=>');
}

function parseFunctionTypeParamCount(typeAnnotation: string): number | undefined {
	const trimmed = typeAnnotation.trim();
	if (!isFunctionTypeAnnotation(trimmed)) {
		return undefined;
	}

	const openParen = trimmed.indexOf('(');
	if (openParen !== 0) {
		return undefined;
	}

	let depth = 1;
	let i = openParen + 1;
	while (i < trimmed.length && depth > 0) {
		if (trimmed[i] === '(') {
			depth += 1;
		} else if (trimmed[i] === ')') {
			depth -= 1;
		}
		if (depth === 0) {
			break;
		}
		i += 1;
	}

	if (depth !== 0) {
		return undefined;
	}

	const paramsText = trimmed.substring(openParen + 1, i);
	return countCommaSeparatedItems(paramsText);
}

function isValidIdentifierText(text: string): boolean {
	if (text.length === 0) {
		return false;
	}
	if (!isIdentifierStartChar(text[0])) {
		return false;
	}
	for (let i = 1; i < text.length; i += 1) {
		if (!isIdentifierChar(text[i])) {
			return false;
		}
	}
	return true;
}

function isInitializerEqualsAt(statement: string, idx: number): boolean {
	let next: string | undefined;
	if (idx + 1 < statement.length) {
		next = statement[idx + 1];
	}
	if (next === '>' || next === '=') {
		return false;
	}

	let prev: string | undefined;
	if (idx > 0) {
		prev = statement[idx - 1];
	}
	if (prev === '!' || prev === '<' || prev === '>') {
		return false;
	}

	return true;
}

function findInitializerEqualsIndex(statement: string): number {
	const depth: StatementDepth = { parenDepth: 0, braceDepth: 0, squareDepth: 0 };
	let i = 0;

	while (i < statement.length) {
		const ch = statement[i];
		updateStatementDepth(depth, ch);

		if (isTopLevelStatementDepth(depth) && ch === '=' && isInitializerEqualsAt(statement, i)) {
			return i;
		}

		i += 1;
	}

	return -1;
}

export function parseLetFunctionReferenceTarget(
	code: string,
	letIdx: number,
	functions: Map<string, number>,
): Result<ParsedLetFunctionReferenceTarget | undefined> {
	const parsedLet = parseFunctionReferenceLetHead(code, letIdx);
	if (parsedLet === undefined) {
		return ok(undefined);
	}

	const typeAnnotation = extractTypeAnnotationFromLet(code, parsedLet.typeColonIdx);
	if (parseFunctionTypeParamCount(typeAnnotation) === undefined) {
		return ok(undefined);
	}

	const stmtEnd = findStatementEnd(code, letIdx);
	const initializer = extractInitializerIdentifier(code.substring(letIdx, stmtEnd));
	if (initializer === undefined) {
		return ok(undefined);
	}

	const actualParamCount = functions.get(initializer);
	if (actualParamCount === undefined) {
		return err(`Function '${initializer}' not defined`);
	}

	const target: FunctionRefTarget = { functionName: initializer, paramCount: actualParamCount };
	const parsed: ParsedLetFunctionReferenceTarget = {
		varName: parsedLet.varName,
		target,
		nextIdx: stmtEnd,
	};
	return ok(parsed);
}

interface ParsedLetHead {
	varName: string;
	typeColonIdx: number;
}

function parseFunctionReferenceLetHead(code: string, letIdx: number): ParsedLetHead | undefined {
	let i = letIdx + 3;
	i = skipWhitespaceInCode(code, i);

	if (isKeywordAt(code, i, 'mut')) {
		i += 3;
		i = skipWhitespaceInCode(code, i);
	}

	const varName = parseIdentifier(code, i);
	if (varName.length === 0) {
		return undefined;
	}
	i += varName.length;
	i = skipWhitespaceInCode(code, i);

	if (i >= code.length || code[i] !== ':') {
		return undefined;
	}

	return { varName, typeColonIdx: i };
}

function extractInitializerIdentifier(statement: string): string | undefined {
	const equalsIdx = findInitializerEqualsIndex(statement);
	if (equalsIdx < 0) {
		return undefined;
	}

	const initializer = statement.substring(equalsIdx + 1).trim();
	if (!isValidIdentifierText(initializer)) {
		return undefined;
	}

	return initializer;
}
