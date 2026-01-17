import { isIdentifierChar, isIdentifierStartChar, isKeywordAt } from './compiler-utils';
import { findMatchingBrace, isWhitespace, splitTopLevelStatements } from './block-parsing';

interface ConsumedText {
	text: string;
	nextIndex: number;
}

interface CompiledLet {
	text: string;
	nextIndex: number;
}

function isUninitializedLet(statement: string): boolean {
	const trimmed = statement.trim();
	if (!trimmed.startsWith('let ')) {
		return false;
	}
	// Check if it has an equals sign (initializer)
	return !trimmed.includes('=');
}

function extractVarName(letStatement: string): string | undefined {
	const trimmed = letStatement.trim();
	if (!trimmed.startsWith('let ')) {
		return undefined;
	}
	const afterLet = trimmed.substring(4).trim();
	if (afterLet.length === 0) {
		return undefined;
	}
	if (!isIdentifierStartChar(afterLet[0])) {
		return undefined;
	}
	let i = 1;
	while (i < afterLet.length && isIdentifierChar(afterLet[i])) {
		i += 1;
	}
	return afterLet.substring(0, i);
}

function extractAssignedVarName(statement: string): string | undefined {
	const trimmed = statement.trim();
	if (trimmed.length === 0) {
		return undefined;
	}
	if (!isIdentifierStartChar(trimmed[0])) {
		return undefined;
	}
	let i = 1;
	while (i < trimmed.length && isIdentifierChar(trimmed[i])) {
		i += 1;
	}
	const name = trimmed.substring(0, i);
	while (i < trimmed.length && isWhitespace(trimmed[i])) {
		i += 1;
	}
	if (i >= trimmed.length || trimmed[i] !== '=') {
		return undefined;
	}
	if (i + 1 < trimmed.length && trimmed[i + 1] === '=') {
		return undefined;
	}
	return name;
}

function wrapUninitializedCheck(expr: string, uninitVars: Set<string>): string {
	// If expr is a simple identifier in the uninitialized set, wrap it
	const trimmed = expr.trim();
	if (uninitVars.has(trimmed)) {
		return `(()=>{if(${trimmed}===Symbol.for('__uninitialized__'))throw new Error("Variable '${trimmed}' is not initialized");return ${trimmed};})()`;
	}
	return expr;
}

function trackUninitializedLet(statement: string, uninitVars: Set<string>): void {
	const varName = extractVarName(statement);
	if (varName !== undefined) {
		uninitVars.add(varName);
	}
}

function compileLetLastStatement(body: string, last: string): string {
	if (isUninitializedLet(last)) {
		return `(() => { ${body}${last} = Symbol.for('__uninitialized__'); return 0; })()`;
	}
	return `(() => { ${body}${last}; return 0; })()`;
}

function compileNonLetLastStatement(body: string, last: string, uninitVars: Set<string>): string {
	const lastTrimmed = last.trim();
	if (
		lastTrimmed.startsWith('if ') &&
		(lastTrimmed.includes('return') || lastTrimmed.includes('yield'))
	) {
		return `(() => { ${body}${last}; })()`;
	}
	const wrappedLast = wrapUninitializedCheck(last, uninitVars);
	return `(() => { ${body}return ${wrappedLast}; })()`;
}

function compileBlockExpression(blockContent: string): string {
	const statements = splitTopLevelStatements(blockContent);
	if (statements.length === 0) {
		return '(() => { return 0; })()';
	}

	const last = statements[statements.length - 1];
	const head = statements.slice(0, statements.length - 1);
	const uninitVars = new Set<string>();

	const bodyParts: string[] = [];
	let i = 0;
	while (i < head.length) {
		const stmt = head[i];
		if (isUninitializedLet(stmt)) {
			trackUninitializedLet(stmt, uninitVars);
			bodyParts.push(`${stmt} = Symbol.for('__uninitialized__');`);
			i = i + 1;
			continue;
		}

		const assignedName = extractAssignedVarName(stmt);
		if (assignedName !== undefined) {
			uninitVars.delete(assignedName);
		}
		bodyParts.push(`${stmt};`);
		i = i + 1;
	}
	const body = bodyParts.join('');

	if (last.trim().startsWith('let ')) {
		return compileLetLastStatement(body, last);
	}
	return compileNonLetLastStatement(body, last, uninitVars);
}

function consumeWhitespace(code: string, start: number): ConsumedText {
	let i = start;
	while (i < code.length && isWhitespace(code[i])) {
		i = i + 1;
	}
	return {
		text: code.substring(start, i),
		nextIndex: i,
	};
}

function consumeIdentifier(code: string, start: number): ConsumedText {
	let i = start;
	while (i < code.length && isIdentifierChar(code[i])) {
		i = i + 1;
	}
	return {
		text: code.substring(start, i),
		nextIndex: i,
	};
}

function compileLetWithoutType(code: string, idx: number): CompiledLet {
	const parts: string[] = [];
	parts.push('let');

	let j = idx + 3;
	const ws1 = consumeWhitespace(code, j);
	parts.push(ws1.text);
	j = ws1.nextIndex;

	// Check for 'mut' keyword and skip it
	if (isKeywordAt(code, j, 'mut')) {
		j = j + 3; // skip 'mut'
		const ws1a = consumeWhitespace(code, j);
		parts.push(ws1a.text);
		j = ws1a.nextIndex;
	}

	const ident = consumeIdentifier(code, j);
	parts.push(ident.text);
	j = ident.nextIndex;

	const ws2 = consumeWhitespace(code, j);
	parts.push(ws2.text);
	j = ws2.nextIndex;
	if (j >= code.length || code[j] !== ':') {
		return {
			text: parts.join(''),
			nextIndex: j,
		};
	}

	// Skip past the type annotation (after ':')
	j = j + 1;
	const ws3 = consumeWhitespace(code, j);
	j = ws3.nextIndex;
	// Skip type name until we hit '=', ';', or end of code
	j = skipLetTypeAnnotation(code, j);

	return {
		text: parts.join(''),
		nextIndex: j,
	};
}

function skipLetTypeAnnotation(code: string, startIdx: number): number {
	let j = startIdx;
	while (j < code.length) {
		const ch = code[j];
		if (ch === ';') {
			return j;
		}
		if (ch === '=' && code[j + 1] !== '>') {
			return j;
		}
		j = j + 1;
	}
	return j;
}

export function stripLetTypeAnnotations(code: string): string {
	const parts: string[] = [];
	let i = 0;

	while (i < code.length) {
		const idx = code.indexOf('let', i);
		if (idx === -1) {
			parts.push(code.substring(i));
			break;
		}
		parts.push(code.substring(i, idx));
		if (!isKeywordAt(code, idx, 'let')) {
			parts.push('let');
			i = idx + 3;
			continue;
		}

		const compiled = compileLetWithoutType(code, idx);
		parts.push(compiled.text);
		i = compiled.nextIndex;
	}

	return parts.join('');
}

function looksLikeObjectLiteralContent(
	code: string,
	braceStart: number,
	braceEnd: number,
): boolean {
	// Object literals have format: { key: value, key: value }
	// Block expressions have statements like let, if, etc.
	const inner = code.substring(braceStart + 1, braceEnd).trim();
	if (inner.length === 0) {
		return true; // Empty braces {} could be empty object
	}

	// If it starts with a keyword like let, if, while, for, match, function, it's a block
	if (
		inner.startsWith('let ') ||
		inner.startsWith('if ') ||
		inner.startsWith('while ') ||
		inner.startsWith('for ') ||
		inner.startsWith('match ') ||
		inner.startsWith('yield ') ||
		inner.startsWith('return ') ||
		inner.startsWith('function ')
	) {
		return false;
	}

	// If it looks like identifier: value (object literal syntax), it's an object
	// Simple heuristic: if first non-ws char is an identifier followed by :
	let i = 0;
	while (i < inner.length && isWhitespace(inner[i])) {
		i += 1;
	}
	if (i >= inner.length) {
		return true;
	}

	// Check for identifier followed by :
	if (!isIdentifierStartChar(inner[i])) {
		return false;
	}
	while (i < inner.length && isIdentifierChar(inner[i])) {
		i += 1;
	}
	while (i < inner.length && isWhitespace(inner[i])) {
		i += 1;
	}
	return i < inner.length && inner[i] === ':';
}

function isDestructuringPattern(code: string, braceIndex: number): boolean {
	// Check if this is `let { ... }` destructuring pattern
	let j = braceIndex - 1;
	while (j >= 0 && isWhitespace(code[j])) {
		j -= 1;
	}

	// Check for 'let' or 'let mut' before the brace
	if (j >= 2 && isKeywordAt(code, j - 2, 'let')) {
		return true;
	}
	if (j >= 5 && isKeywordAt(code, j - 5, 'let')) {
		// Could be 'let mut' - check if there's 'mut' in between
		const potentialMut = code.substring(j - 2, j + 1).trim();
		if (potentialMut === 'mut') {
			return true;
		}
	}

	return false;
}

function isObjectLiteralContext(code: string, braceIndex: number): boolean {
	// Check if the brace is immediately preceded by '(' or '='
	let j = braceIndex - 1;
	while (j >= 0 && isWhitespace(code[j])) {
		j -= 1;
	}
	if (j < 0) {
		return false;
	}
	const prevChar = code[j];

	// '=' indicates object literal as assignment: x = { ... }
	// But make sure it's not '==' or '=>'
	if (prevChar === '=') {
		if (j > 0 && code[j - 1] === '=') {
			return false;
		}
		// Find the matching closing brace
		const closeIndex = findMatchingBrace(code, braceIndex);
		if (closeIndex === undefined) {
			return false;
		}
		return looksLikeObjectLiteralContent(code, braceIndex, closeIndex);
	}

	// '(' - need to check if content looks like object literal
	if (prevChar === '(') {
		const closeIndex = findMatchingBrace(code, braceIndex);
		if (closeIndex === undefined) {
			return false;
		}
		return looksLikeObjectLiteralContent(code, braceIndex, closeIndex);
	}

	return false;
}

export function compileBracedExpressionsToIife(code: string): string {
	const parts: string[] = [];
	let i = 0;

	while (i < code.length) {
		const ch = code[i];
		if (ch !== '{') {
			parts.push(ch);
			i = i + 1;
			continue;
		}

		const closeIndex = findMatchingBrace(code, i);
		if (closeIndex === undefined) {
			parts.push(ch);
			i = i + 1;
			continue;
		}

		const isControlFlowBlock = isControlFlowBlockBeforeBrace(code, i);
		const isObjectLiteral = isObjectLiteralContext(code, i);
		const isFunctionBody = isFunctionBodyBeforeBrace(code, i);
		const isDestructuring = isDestructuringPattern(code, i);

		const inner = code.substring(i + 1, closeIndex);
		const compiledInner = compileBracedExpressionsToIife(inner);
		if (isControlFlowBlock || isObjectLiteral || isFunctionBody || isDestructuring) {
			parts.push('{');
			parts.push(compiledInner);
			parts.push('}');
			i = closeIndex + 1;
			continue;
		}
		parts.push(compileBlockExpression(compiledInner));
		if (shouldInsertSemicolonAfterIife(code, closeIndex + 1)) {
			parts.push(';');
		}
		i = closeIndex + 1;
	}

	return parts.join('');
}

function shouldInsertSemicolonAfterIife(code: string, startIdx: number): boolean {
	let i = startIdx;
	while (i < code.length && isWhitespace(code[i])) {
		i += 1;
	}
	if (i >= code.length) {
		return false;
	}

	const next = code[i];
	if (next === '(' || next === '[' || next === '.') {
		return false;
	}
	if (isIdentifierStartChar(next)) {
		return true;
	}
	if (next >= '0' && next <= '9') {
		return true;
	}
	if (next === '{' || next === "'" || next === '"' || next === '`') {
		return true;
	}
	return false;
}

function skipBackwardsToMatchingParen(code: string, startIdx: number): number {
	let j = startIdx;
	let depth = 1;
	while (j >= 0 && depth > 0) {
		if (code[j] === ')') {
			depth += 1;
		} else if (code[j] === '(') {
			depth -= 1;
		}
		j -= 1;
	}
	return j;
}

function skipBackwardsWhitespace(code: string, startIdx: number): number {
	let j = startIdx;
	while (j >= 0 && isWhitespace(code[j])) {
		j -= 1;
	}
	return j;
}

function skipBackwardsIdentifier(code: string, startIdx: number): number {
	let j = startIdx;
	while (j >= 0 && isIdentifierChar(code[j])) {
		j -= 1;
	}
	return j;
}

function isFunctionBodyBeforeBrace(code: string, braceIndex: number): boolean {
	let j = skipBackwardsWhitespace(code, braceIndex - 1);

	if (j < 0 || code[j] !== ')') {
		return false;
	}

	// Skip to matching (
	j = skipBackwardsToMatchingParen(code, j - 1);

	// Now j is before the (, skip whitespace
	j = skipBackwardsWhitespace(code, j);

	// Check for identifier (function name)
	if (j < 0 || !isIdentifierChar(code[j])) {
		return false;
	}

	// Skip the identifier backwards
	j = skipBackwardsIdentifier(code, j);

	// Skip whitespace
	j = skipBackwardsWhitespace(code, j);

	// Check for 'function' keyword
	if (j >= 7 && code.substring(j - 7, j + 1) === 'function') {
		return true;
	}

	return false;
}

function isControlFlowBlockBeforeBrace(code: string, braceIndex: number): boolean {
	let j = skipBackwardsWhitespace(code, braceIndex - 1);

	if (j >= 3 && isKeywordAt(code, j - 3, 'else')) {
		return true;
	}

	if (j < 0 || code[j] !== ')') {
		return false;
	}

	j = skipBackwardsToMatchingParen(code, j - 1);
	j = skipBackwardsWhitespace(code, j);

	if (j >= 1 && isKeywordAt(code, j - 1, 'if')) {
		return true;
	}
	if (j >= 2 && isKeywordAt(code, j - 2, 'for')) {
		return true;
	}
	if (j >= 4 && isKeywordAt(code, j - 4, 'while')) {
		return true;
	}
	if (j >= 4 && isKeywordAt(code, j - 4, 'match')) {
		return true;
	}
	return false;
}
