import { isIdentifierChar, isIdentifierStartChar, isKeywordAt } from './compiler-utils';

function isWhitespace(ch: string): boolean {
	return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function findMatchingBrace(code: string, openIndex: number): number | undefined {
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

function skipToMatchingParen(block: string, startIdx: number): number {
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

function skipToMatchingBrace(block: string, startIdx: number): number {
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

function skipWhitespaceInBlock(block: string, startIdx: number): number {
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

function parseControlFlowParensAndBody(block: string, startIdx: number): number {
	let j = skipWhitespaceInBlock(block, startIdx);
	if (j < block.length && block[j] === '(') {
		j = skipToMatchingParen(block, j);
	}
	j = skipWhitespaceInBlock(block, j);
	return parseControlFlowBody(block, j);
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

function splitTopLevelStatements(block: string): string[] {
	const parts: string[] = [];
	let start = 0;
	let parenDepth = 0;
	let braceDepth = 0;
	let bracketDepth = 0;
	let i = 0;

	while (i < block.length) {
		const ch = block[i];
		if (
			parenDepth === 0 &&
			braceDepth === 0 &&
			bracketDepth === 0 &&
			(isKeywordAt(block, i, 'if') ||
				isKeywordAt(block, i, 'while') ||
				isKeywordAt(block, i, 'for') ||
				isKeywordAt(block, i, 'match'))
		) {
			const j = parseControlFlowStatement(block, i);
			parts.push(block.substring(start, j).trim());
			start = j;
			i = j;
			continue;
		}
		if (ch === '(') {
			parenDepth += 1;
		} else if (ch === ')') {
			parenDepth -= 1;
		} else if (ch === '{') {
			braceDepth += 1;
		} else if (ch === '}') {
			braceDepth -= 1;
		} else if (ch === '[') {
			bracketDepth += 1;
		} else if (ch === ']') {
			bracketDepth -= 1;
		}
		if (ch === ';' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
			parts.push(block.substring(start, i).trim());
			start = i + 1;
		}
		i += 1;
	}
	parts.push(block.substring(start).trim());
	return parts.filter((p): boolean => p.length > 0);
}

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

		const inner = code.substring(i + 1, closeIndex);
		const compiledInner = compileBracedExpressionsToIife(inner);
		if (isControlFlowBlock) {
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

function isControlFlowBlockBeforeBrace(code: string, braceIndex: number): boolean {
	let j = braceIndex - 1;
	while (j >= 0 && isWhitespace(code[j])) {
		j -= 1;
	}

	if (j >= 3 && isKeywordAt(code, j - 3, 'else')) {
		return true;
	}

	if (j < 0 || code[j] !== ')') {
		return false;
	}

	let depth = 1;
	j -= 1;
	while (j >= 0 && depth > 0) {
		if (code[j] === ')') {
			depth += 1;
		} else if (code[j] === '(') {
			depth -= 1;
		}
		j -= 1;
	}

	while (j >= 0 && isWhitespace(code[j])) {
		j -= 1;
	}

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
