import {
	findMatchingParen,
	isKeywordAt,
	parseIdentifier,
	skipWhitespaceInCode,
} from '../compiler-utils';
import { transformMethodCalls } from './method-calls';

interface FunctionReplacement {
	text: string;
	nextIdx: number;
	methodName?: string; // If function has 'this' param, this is the method name
}

interface ParsedFunctionHeader {
	name: string;
	paramsJs: string;
	hasThisParam: boolean;
	bodyStart: number;
}

function isWhitespace(ch: string): boolean {
	return ch === ' ' || ch === '\t' || ch === '\n';
}

function splitTopLevelParams(params: string): string[] {
	const result: string[] = [];
	let i = 0;
	let start = 0;
	let depth = 0;

	while (i < params.length) {
		const ch = params[i];
		if (ch === '(') {
			depth += 1;
		} else if (ch === ')') {
			depth -= 1;
		} else if (ch === ',' && depth === 0) {
			result.push(params.substring(start, i));
			start = i + 1;
		}
		i += 1;
	}

	result.push(params.substring(start));
	return result;
}

interface CompiledParams {
	paramsJs: string;
	hasThisParam: boolean;
}

function compileParamsToJs(params: string): CompiledParams {
	const trimmed = params.trim();
	if (trimmed.length === 0) {
		return { paramsJs: '', hasThisParam: false };
	}

	const parts = splitTopLevelParams(params);
	const compiled: string[] = [];
	let hasThisParam = false;

	for (let i = 0; i < parts.length; i++) {
		const piece = parts[i].trim();
		if (piece.length === 0) {
			continue;
		}

		const colonIdx = piece.indexOf(':');
		if (colonIdx < 0) {
			compiled.push(piece);
			continue;
		}

		let paramName = piece.substring(0, colonIdx).trim();
		// If first param is 'this', rename it to '__self'
		if (i === 0 && paramName === 'this') {
			hasThisParam = true;
			paramName = '__self';
		}
		compiled.push(paramName);
	}

	return { paramsJs: compiled.join(', '), hasThisParam };
}

function decrementDepth(depth: number): number {
	if (depth > 0) {
		return depth - 1;
	}
	return depth;
}

function incrementDepth(depth: number): number {
	return depth + 1;
}

function skipQuotedString(code: string, startIdx: number): number {
	const quote = code[startIdx];
	let i = startIdx + 1;
	while (i < code.length) {
		if (code[i] === quote && code[i - 1] !== '\\') {
			return i + 1;
		}
		i += 1;
	}
	return i;
}

function skipGenericParams(code: string, idx: number): number {
	let i = idx;
	if (i >= code.length || code[i] !== '<') {
		return i;
	}

	i += 1;
	let depth = 1;
	while (i < code.length) {
		const ch = code[i];
		if (ch === '"' || ch === "'" || ch === '`') {
			i = skipQuotedString(code, i);
			continue;
		}
		if (ch === '<') {
			depth += 1;
		}
		if (ch === '>') {
			depth -= 1;
		}
		if (ch === '>' && depth === 0) {
			return i + 1;
		}
		i += 1;
	}

	return i;
}

function isBinaryOperatorAfter(code: string, idx: number): boolean {
	let i = idx;
	while (i < code.length && (code[i] === ' ' || code[i] === '\t' || code[i] === '\n')) {
		i += 1;
	}
	if (i >= code.length) {
		return false;
	}
	const ch = code[i];
	// Common binary operators that could follow a block expression
	return (
		ch === '+' ||
		ch === '-' ||
		ch === '*' ||
		ch === '/' ||
		ch === '%' ||
		ch === '&' ||
		ch === '|' ||
		ch === '^' ||
		ch === '<' ||
		ch === '>' ||
		ch === '=' ||
		ch === '!'
	);
}

interface BodySearchState {
	idx: number;
	parenDepth: number;
	braceDepth: number;
	bracketDepth: number;
}

function updateDepths(state: BodySearchState, ch: string): void {
	if (ch === '(') {
		state.parenDepth = incrementDepth(state.parenDepth);
	} else if (ch === ')') {
		state.parenDepth = decrementDepth(state.parenDepth);
	} else if (ch === '{') {
		state.braceDepth = incrementDepth(state.braceDepth);
	} else if (ch === '}') {
		state.braceDepth = decrementDepth(state.braceDepth);
	} else if (ch === '[') {
		state.bracketDepth = incrementDepth(state.bracketDepth);
	} else if (ch === ']') {
		state.bracketDepth = decrementDepth(state.bracketDepth);
	}
}

function isAtTerminator(code: string, state: BodySearchState): boolean {
	const ch = code[state.idx];
	return ch === ';' && state.parenDepth === 0 && state.braceDepth === 0 && state.bracketDepth === 0;
}

function checkBraceClose(code: string, state: BodySearchState, startsWithBrace: boolean): number {
	if (!startsWithBrace || state.braceDepth !== 0) {
		return -1;
	}
	if (isBinaryOperatorAfter(code, state.idx + 1)) {
		return -1;
	}
	return state.idx + 1;
}

function processBodyChar(code: string, state: BodySearchState, startsWithBrace: boolean): number {
	const ch = code[state.idx];
	if (ch === '"' || ch === "'" || ch === '`') {
		state.idx = skipQuotedString(code, state.idx);
		return -1;
	}
	updateDepths(state, ch);

	if (ch === '}') {
		const result = checkBraceClose(code, state, startsWithBrace);
		if (result >= 0) {
			return result;
		}
	}
	if (isAtTerminator(code, state)) {
		return state.idx;
	}
	state.idx += 1;
	return -1;
}

function findFunctionBodyEnd(code: string, startIdx: number): number {
	const state: BodySearchState = { idx: startIdx, parenDepth: 0, braceDepth: 0, bracketDepth: 0 };
	const startsWithBrace = startIdx < code.length && code[startIdx] === '{';

	while (state.idx < code.length) {
		const result = processBodyChar(code, state, startsWithBrace);
		if (result >= 0) {
			return result;
		}
	}

	return code.length;
}

function isBodyArrow(code: string, idx: number): boolean {
	// Check if => at idx is followed by { (indicating block body) or something else (expression body)
	// Return type => is always followed by a type identifier
	if (idx + 2 > code.length || code[idx] !== '=' || code[idx + 1] !== '>') {
		return false;
	}

	let i = idx + 2;
	// Skip whitespace
	while (i < code.length && (code[i] === ' ' || code[i] === '\t' || code[i] === '\n')) {
		i += 1;
	}

	if (i >= code.length) {
		return true; // End of code, treat as body arrow
	}

	const ch = code[i];
	// If followed by { or ( or identifier starting with lowercase, it's likely body
	// If followed by identifier starting with uppercase (type), it's return type
	if (ch === '{' || ch === '(') {
		return true;
	}

	// Check if followed by fn keyword (function expression)
	if (code.substring(i, i + 2) === 'fn') {
		return true;
	}

	// Check if followed by a lowercase letter (variable/expression)
	if (ch >= 'a' && ch <= 'z') {
		return true;
	}

	// Check for numbers
	if (ch >= '0' && ch <= '9') {
		return true;
	}

	return false;
}

function skipReturnType(code: string, idx: number): number {
	let i = idx;
	if (i >= code.length || code[i] !== ':') {
		return i;
	}

	i += 1;

	while (i < code.length) {
		if (isBodyArrow(code, i)) {
			return i;
		}
		i += 1;
	}
	return i;
}

function parseFunctionHeader(code: string, idx: number): ParsedFunctionHeader | undefined {
	let i = idx + 2;
	i = skipWhitespaceInCode(code, i);
	if (i >= code.length) {
		return undefined;
	}

	const name = parseIdentifier(code, i);
	if (name.length === 0) {
		return undefined;
	}
	i += name.length;
	i = skipWhitespaceInCode(code, i);
	i = skipGenericParams(code, i);
	i = skipWhitespaceInCode(code, i);
	if (i >= code.length || code[i] !== '(') {
		return undefined;
	}

	const closeParen = findMatchingParen(code, i);
	if (closeParen < 0) {
		return undefined;
	}
	const params = code.substring(i + 1, closeParen);
	const paramsJs = compileParamsToJs(params);

	i = closeParen + 1;
	i = skipWhitespaceInCode(code, i);
	i = skipReturnType(code, i);
	i = skipWhitespaceInCode(code, i);
	if (i + 1 >= code.length || code[i] !== '=' || code[i + 1] !== '>') {
		return undefined;
	}

	i += 2;
	while (i < code.length && isWhitespace(code[i])) {
		i += 1;
	}

	return { name, paramsJs: paramsJs.paramsJs, hasThisParam: paramsJs.hasThisParam, bodyStart: i };
}

function bodyStartsWithReturn(bodyExpr: string): boolean {
	const trimmed = bodyExpr.trimStart();
	return trimmed.startsWith('return ') || trimmed.startsWith('return;') || trimmed === 'return';
}

function bodyIsThis(bodyExpr: string): boolean {
	return bodyExpr.trim() === 'this';
}

function getLastStatementPart(inner: string): string {
	const lastSemicolon = inner.lastIndexOf(';');
	if (lastSemicolon >= 0) {
		return inner.substring(lastSemicolon + 1).trim();
	}
	return inner.trim();
}

function bodyIsBlockEndingWithThis(bodyExpr: string): boolean {
	const trimmed = bodyExpr.trim();
	if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
		return false;
	}
	// Check if the last statement in the block is `this`
	const inner = trimmed.substring(1, trimmed.length - 1).trim();
	const lastPart = getLastStatementPart(inner);
	return lastPart === 'this';
}

interface InnerFunctionInfo {
	name: string;
}

function extractFunctionName(bodyExpr: string, startIdx: number): InnerFunctionInfo | undefined {
	let i = startIdx + 8; // skip 'function'
	// Skip whitespace
	while (i < bodyExpr.length && (bodyExpr[i] === ' ' || bodyExpr[i] === '\t')) {
		i += 1;
	}
	const name = parseIdentifier(bodyExpr, i);
	if (name.length > 0) {
		return { name };
	}
	return undefined;
}

function tryExtractFunctionAt(bodyExpr: string, i: number): InnerFunctionInfo | undefined {
	if (!isKeywordAt(bodyExpr, i, 'function')) {
		return undefined;
	}
	return extractFunctionName(bodyExpr, i);
}

function extractInnerFunctions(bodyExpr: string): InnerFunctionInfo[] {
	const result: InnerFunctionInfo[] = [];
	for (let i = 0; i < bodyExpr.length; i += 1) {
		const found = tryExtractFunctionAt(bodyExpr, i);
		if (found !== undefined) {
			result.push(found);
		}
	}
	return result;
}

function buildThisObjectWithMethods(paramsJs: string, methods: InnerFunctionInfo[]): string {
	const fields: string[] = [];

	// Add parameters
	const hasParams = paramsJs.trim().length > 0;
	if (hasParams) {
		const paramNames = paramsJs.split(',').map((p): string => p.trim());
		for (const name of paramNames) {
			fields.push(`${name}: ${name}`);
		}
	}

	// Add methods
	for (const method of methods) {
		fields.push(`${method.name}: ${method.name}`);
	}

	if (fields.length === 0) {
		return '{}';
	}
	return `{ ${fields.join(', ')} }`;
}

function buildThisObjectFromParams(paramsJs: string): string {
	if (paramsJs.trim().length === 0) {
		return '{}';
	}
	const paramNames = paramsJs.split(',').map((p): string => p.trim());
	const fields = paramNames.map((name): string => `${name}: ${name}`);
	return `{ ${fields.join(', ')} }`;
}

function replaceThisWithSelf(code: string): string {
	// Replace standalone 'this' with '__self', but not 'this.x' (field access)
	let result = '';
	let i = 0;
	while (i < code.length) {
		if (!isKeywordAt(code, i, 'this')) {
			result += code[i];
			i += 1;
			continue;
		}
		// Check if followed by '.' (field access) - don't replace in that case
		let j = i + 4;
		while (j < code.length && (code[j] === ' ' || code[j] === '\t')) {
			j += 1;
		}
		const isFieldAccess = j < code.length && code[j] === '.';
		if (isFieldAccess) {
			// Keep 'this' as-is for field access (compileThisKeyword handles this)
			result += 'this';
		} else {
			result += '__self';
		}
		i += 4;
	}
	return result;
}

function getStatementsBeforeThis(inner: string): string {
	const lastSemicolon = inner.lastIndexOf(';');
	if (lastSemicolon >= 0) {
		return inner.substring(0, lastSemicolon + 1);
	}
	return '';
}

function buildBlockThisBody(processedBody: string, paramsJs: string): string {
	const methods = extractInnerFunctions(processedBody);
	const thisObj = buildThisObjectWithMethods(paramsJs, methods);
	// Strip the trailing 'this' from the block and replace with the object
	const inner = processedBody
		.trim()
		.substring(1, processedBody.trim().length - 1)
		.trim();
	const statementsBeforeThis = getStatementsBeforeThis(inner);
	return `{${statementsBeforeThis}return (${thisObj});}`;
}

function buildFunctionBody(processedBody: string, paramsJs: string): string {
	if (bodyIsThis(processedBody)) {
		// Constructor pattern: fn Name(x, y) => this becomes function that returns object
		const thisObj = buildThisObjectFromParams(paramsJs);
		return `{return (${thisObj});}`;
	}
	if (bodyIsBlockEndingWithThis(processedBody)) {
		return buildBlockThisBody(processedBody, paramsJs);
	}
	if (bodyStartsWithReturn(processedBody)) {
		return `{${processedBody};}`;
	}
	return `{return (${processedBody});}`;
}

function getMethodName(header: ParsedFunctionHeader): string | undefined {
	if (header.hasThisParam) {
		return header.name;
	}
	return undefined;
}

function tryReplaceFunctionAt(code: string, idx: number): FunctionReplacement | undefined {
	const header = parseFunctionHeader(code, idx);
	if (header === undefined) {
		return undefined;
	}

	const bodyEnd = findFunctionBodyEnd(code, header.bodyStart);
	const bodyExpr = code.substring(header.bodyStart, bodyEnd).trim();

	let nextIdx = bodyEnd;
	// Skip existing semicolon if present
	if (nextIdx < code.length && code[nextIdx] === ';') {
		nextIdx += 1;
	}

	// Recursively process nested function definitions in the body
	let processedBody = replaceFunctionDefinitions(bodyExpr);

	// If function has 'this' parameter, replace 'this' references with '__self'
	if (header.hasThisParam) {
		processedBody = replaceThisWithSelf(processedBody);
	}

	const fnBody = buildFunctionBody(processedBody, header.paramsJs);

	// Always add semicolon after function definition
	const replacement = `function ${header.name}(${header.paramsJs})${fnBody};`;
	const methodName = getMethodName(header);
	return { text: replacement, nextIdx, methodName };
}

interface TransformResult {
	code: string;
	methodNames: Set<string>;
}

function transformFunctionDefinitions(code: string): TransformResult {
	let result = '';
	let i = 0;
	const methodNames = new Set<string>();

	while (i < code.length) {
		if (!isKeywordAt(code, i, 'fn')) {
			result += code[i];
			i += 1;
			continue;
		}

		const replacement = tryReplaceFunctionAt(code, i);
		if (replacement === undefined) {
			result += code[i];
			i += 1;
			continue;
		}

		if (replacement.methodName !== undefined) {
			methodNames.add(replacement.methodName);
		}
		result += replacement.text;
		i = replacement.nextIdx;
	}

	return { code: result, methodNames };
}

export function replaceFunctionDefinitions(code: string): string {
	const transformed = transformFunctionDefinitions(code);
	return transformMethodCalls(transformed.code, transformed.methodNames);
}
