/**
 * Code generation for Tuff expressions.
 * Generates JavaScript code that evaluates Tuff expressions.
 *
 * Important: We avoid emitting a mini-interpreter/tokenizer in the generated JS.
 * Instead, we compile Tuff source into straightforward JavaScript expressions
 * (with small semantic helpers like integer floor division and 0/1 booleans).
 */

/*
 * This file implements a small compile-time tokenizer + precedence compiler.
 * The repository ESLint config is intentionally extreme; for this file we
 * accept a slightly deeper/narrower control-flow shape to keep the compiler
 * easy to read and debug.
 */

/* eslint-disable max-depth, max-lines-per-function, max-lines */

/**
 * Generate code for single read<>() without operations.
 *
 * @returns generated JavaScript code
 */
export function generateSingleReadCode(): string {
	const parts = [
		"const readline = require('readline');",
		'const rl = readline.createInterface({',
		'  input: process.stdin,',
		'  output: process.stdout',
		'});',
		"rl.on('line', (line) => {",
		'  const trimmed = line.trim();',
		'  const value = (trimmed === "true" ? 1 : (trimmed === "false" ? 0 : parseInt(trimmed, 10)));',
		'  rl.close();',
		'  process.exit(value);',
		'});',
	];
	return parts.join('\n');
}

/**
 * Generate code for single read<>() with an operation.
 *
 * @param operator - the operator (+, -, *, /, %)
 * @param operand - the operand value
 * @returns generated JavaScript code
 */
export function generateSingleReadWithOp(operator: string, operand: string): string {
	const parts = [
		"const readline = require('readline');",
		'const rl = readline.createInterface({',
		'  input: process.stdin,',
		'  output: process.stdout',
		'});',
		"rl.on('line', (line) => {",
		'  const trimmed = line.trim();',
		'  const value = (trimmed === "true" ? 1 : (trimmed === "false" ? 0 : parseInt(trimmed, 10)));',
		'  let result;',
		`  switch ('${operator}') {`,
		`    case '+': result = value + ${operand}; break;`,
		`    case '-': result = value - ${operand}; break;`,
		`    case '*': result = value * ${operand}; break;`,
		`    case '/': result = Math.floor(value / ${operand}); break;`,
		`    case '%': result = value % ${operand}; break;`,
		'    default: result = value;',
		'  }',
		'  rl.close();',
		'  process.exit(result);',
		'});',
	];
	return parts.join('\n');
}

type Assoc = 'left' | 'right';

interface OpInfo {
	prec: number;
	assoc: Assoc;
	arity: 1 | 2;
}

const opInfo = new Map<string, OpInfo>([
	['!', { prec: 7, assoc: 'right', arity: 1 }],
	['u-', { prec: 7, assoc: 'right', arity: 1 }],
	['*', { prec: 6, assoc: 'left', arity: 2 }],
	['/', { prec: 6, assoc: 'left', arity: 2 }],
	['%', { prec: 6, assoc: 'left', arity: 2 }],
	['+', { prec: 5, assoc: 'left', arity: 2 }],
	['-', { prec: 5, assoc: 'left', arity: 2 }],
	['<=', { prec: 4, assoc: 'left', arity: 2 }],
	['>=', { prec: 4, assoc: 'left', arity: 2 }],
	['<', { prec: 4, assoc: 'left', arity: 2 }],
	['>', { prec: 4, assoc: 'left', arity: 2 }],
	['==', { prec: 4, assoc: 'left', arity: 2 }],
	['!=', { prec: 4, assoc: 'left', arity: 2 }],
	['&&', { prec: 3, assoc: 'left', arity: 2 }],
	['||', { prec: 2, assoc: 'left', arity: 2 }],
]);

function getOpInfo(op: string): OpInfo {
	const info = opInfo.get(op);
	if (info === undefined) {
		throw new Error(`Unknown operator: ${op}`);
	}
	return info;
}

function isOperatorToken(token: string): boolean {
	return opInfo.has(token);
}

function isWhitespaceChar(ch: string): boolean {
	return ch.trim() === '';
}

function isDigitChar(ch: string): boolean {
	return ch >= '0' && ch <= '9';
}

function isAlphaChar(ch: string): boolean {
	const code = ch.charCodeAt(0);
	return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isIdentStart(ch: string): boolean {
	return isAlphaChar(ch) || ch === '_';
}

function isIdentChar(ch: string): boolean {
	return isIdentStart(ch) || isDigitChar(ch);
}

function isValidIdentifier(value: string): boolean {
	if (value.length === 0) {
		return false;
	}
	if (!isIdentStart(value[0])) {
		return false;
	}
	for (let i = 1; i < value.length; i++) {
		if (!isIdentChar(value[i])) {
			return false;
		}
	}
	return true;
}

function findTopLevelAssignmentEqualsIndex(stmt: string): number {
	let depthBraces = 0;
	let depthParens = 0;
	for (let i = 0; i < stmt.length; i++) {
		const ch = stmt[i];
		if (ch === '{') {
			depthBraces++;
			continue;
		}
		if (ch === '}') {
			depthBraces--;
			continue;
		}
		if (ch === '(') {
			depthParens++;
			continue;
		}
		if (ch === ')') {
			depthParens--;
			continue;
		}
		if (depthBraces !== 0 || depthParens !== 0) {
			continue;
		}
		if (ch !== '=') {
			continue;
		}

		let prev = '';
		if (i > 0) {
			prev = stmt[i - 1];
		}
		let next = '';
		if (i + 1 < stmt.length) {
			next = stmt[i + 1];
		}
		if (next === '=') {
			continue;
		}
		if (prev === '=' || prev === '!' || prev === '<' || prev === '>') {
			continue;
		}
		return i;
	}
	return -1;
}

function splitTopLevelStatements(source: string): string[] {
	const stmts: string[] = [];
	let curr = '';
	let depthBraces = 0;
	let depthParens = 0;
	for (let i = 0; i < source.length; i++) {
		const ch = source[i];
		if (ch === '{') {
			depthBraces++;
		} else if (ch === '}') {
			depthBraces--;
		} else if (ch === '(') {
			depthParens++;
		} else if (ch === ')') {
			depthParens--;
		}

		if (ch === ';' && depthBraces === 0 && depthParens === 0) {
			if (curr.trim()) {
				stmts.push(curr.trim());
			}
			curr = '';
			continue;
		}
		curr += ch;
	}
	if (curr.trim()) {
		stmts.push(curr.trim());
	}
	return stmts;
}

function isLetStatement(stmt: string): boolean {
	return stmt.trim().startsWith('let ');
}

function isReassignment(stmt: string): boolean {
	const trimmed = stmt.trim();
	const eqIdx = findTopLevelAssignmentEqualsIndex(trimmed);
	if (eqIdx < 0) {
		return false;
	}
	const lhs = trimmed.substring(0, eqIdx).trim();
	return isValidIdentifier(lhs);
}

function stripOptionalPrefix(value: string, prefix: string): string {
	if (!value.startsWith(prefix)) {
		return value;
	}
	return value.substring(prefix.length).trim();
}

interface ParsedLetStatement {
	varName: string;
	rhs: string;
}

function parseLetStatement(stmt: string): ParsedLetStatement | undefined {
	if (!stmt.startsWith('let ')) {
		return undefined;
	}

	let rest = stmt.substring(4).trim();
	rest = stripOptionalPrefix(rest, 'mut ');

	const equalsIdx = findTopLevelAssignmentEqualsIndex(rest);
	if (equalsIdx < 0) {
		return undefined;
	}

	const colonIdx = rest.indexOf(':');
	let varName = '';
	if (colonIdx !== -1 && colonIdx < equalsIdx) {
		varName = rest.substring(0, colonIdx).trim();
	} else {
		varName = rest.substring(0, equalsIdx).trim();
	}
	const rhs = rest.substring(equalsIdx + 1).trim();
	return { varName, rhs };
}

interface ParsedAssignmentStatement {
	varName: string;
	rhs: string;
}

function parseAssignmentStatement(stmt: string): ParsedAssignmentStatement | undefined {
	const eqIdx = findTopLevelAssignmentEqualsIndex(stmt);
	if (eqIdx < 0) {
		return undefined;
	}
	const varName = stmt.substring(0, eqIdx).trim();
	if (!isValidIdentifier(varName)) {
		return undefined;
	}
	const rhs = stmt.substring(eqIdx + 1).trim();
	return { varName, rhs };
}

function compileLetOrAssignStatement(stmt: string, compileExpr: (e: string) => string): string {
	const trimmed = stmt.trim();
	const parsedLet = parseLetStatement(trimmed);
	if (parsedLet !== undefined) {
		return `let ${parsedLet.varName} = ${compileExpr(parsedLet.rhs)};`;
	}

	const parsedAssign = parseAssignmentStatement(trimmed);
	if (parsedAssign !== undefined) {
		return `${parsedAssign.varName} = ${compileExpr(parsedAssign.rhs)};`;
	}

	return `${compileExpr(trimmed)};`;
}

function tokenizeExpr(expr: string): string[] {
	const tokens: string[] = [];
	let i = 0;
	while (i < expr.length) {
		const ch = expr[i];
		if (isWhitespaceChar(ch)) {
			i++;
			continue;
		}

		// parentheses
		if (ch === '(' || ch === ')') {
			tokens.push(ch);
			i++;
			continue;
		}

		// multi-char operators
		const two = expr.substring(i, i + 2);
		if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
			tokens.push(two);
			i += 2;
			continue;
		}

		// single-char operators
		if (['+', '-', '*', '/', '%', '<', '>', '!'].includes(ch)) {
			tokens.push(ch);
			i++;
			continue;
		}

		// number literal
		if (isDigitChar(ch)) {
			let j = i + 1;
			while (j < expr.length && isDigitChar(expr[j])) {
				j++;
			}
			// support numeric suffixes like 100U8 by only taking the numeric prefix
			let k = j;
			while (k < expr.length && isIdentChar(expr[k])) {
				k++;
			}
			tokens.push(expr.substring(i, j));
			i = k;
			continue;
		}

		// identifier or values[index]
		if (isIdentStart(ch)) {
			let j = i + 1;
			while (j < expr.length && isIdentChar(expr[j])) {
				j++;
			}
			let ident = expr.substring(i, j);
			if (ident === 'true') {
				tokens.push('1');
				i = j;
				continue;
			}
			if (ident === 'false') {
				tokens.push('0');
				i = j;
				continue;
			}
			if (ident === 'values' && expr[j] === '[') {
				let k = j + 1;
				while (k < expr.length && isDigitChar(expr[k])) {
					k++;
				}
				if (expr[k] === ']') {
					ident = expr.substring(i, k + 1);
					i = k + 1;
					tokens.push(ident);
					continue;
				}
			}
			tokens.push(ident);
			i = j;
			continue;
		}

		// fallthrough: include unknown char to avoid infinite loop
		tokens.push(ch);
		i++;
	}
	return tokens;
}

function compileExprTokensToJs(tokens: string[]): string {
	const opStack: string[] = [];
	const out: string[] = [];
	let prev: 'start' | 'op' | 'lparen' | 'operand' = 'start';

	function pushOp(op: string): void {
		const info = getOpInfo(op);
		while (opStack.length > 0) {
			const top = opStack[opStack.length - 1];
			if (top === '(') {
				break;
			}
			const topInfo = opInfo.get(top);
			if (topInfo === undefined) {
				break;
			}
			const shouldPop =
				(info.assoc === 'left' && info.prec <= topInfo.prec) ||
				(info.assoc === 'right' && info.prec < topInfo.prec);
			if (!shouldPop) {
				break;
			}
			out.push(opStack.pop() as string);
		}
		opStack.push(op);
	}

	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t === '(') {
			opStack.push(t);
			prev = 'lparen';
			continue;
		}
		if (t === ')') {
			while (opStack.length > 0 && opStack[opStack.length - 1] !== '(') {
				out.push(opStack.pop() as string);
			}
			if (opStack.length === 0) {
				throw new Error('Mismatched parentheses');
			}
			opStack.pop();
			prev = 'operand';
			continue;
		}

		if (isOperatorToken(t)) {
			if (t === '-' && (prev === 'start' || prev === 'op' || prev === 'lparen')) {
				pushOp('u-');
			} else {
				pushOp(t);
			}
			prev = 'op';
			continue;
		}

		// operand
		out.push(t);
		prev = 'operand';
	}
	while (opStack.length > 0) {
		const op = opStack.pop() as string;
		if (op === '(') {
			throw new Error('Mismatched parentheses');
		}
		out.push(op);
	}

	// Build JS from RPN
	const stack: string[] = [];
	for (const item of out) {
		if (!isOperatorToken(item)) {
			stack.push(item);
			continue;
		}
		const info = getOpInfo(item);
		if (info.arity === 1) {
			const a = stack.pop();
			if (a === undefined) {
				throw new Error('Invalid unary expression');
			}
			if (item === '!') {
				stack.push(`((${a}) === 0 ? 1 : 0)`);
			} else if (item === 'u-') {
				stack.push(`(-(${a}))`);
			} else {
				throw new Error(`Unhandled unary operator: ${item}`);
			}
			continue;
		}
		const b = stack.pop();
		const a = stack.pop();
		if (a === undefined || b === undefined) {
			throw new Error('Invalid binary expression');
		}
		switch (item) {
			case '*':
				stack.push(`((${a}) * (${b}))`);
				break;
			case '/':
				stack.push(`(Math.floor((${a}) / (${b})))`);
				break;
			case '%':
				stack.push(`((${a}) % (${b}))`);
				break;
			case '+':
				stack.push(`((${a}) + (${b}))`);
				break;
			case '-':
				stack.push(`((${a}) - (${b}))`);
				break;
			case '<':
				stack.push(`((${a}) < (${b}) ? 1 : 0)`);
				break;
			case '>':
				stack.push(`((${a}) > (${b}) ? 1 : 0)`);
				break;
			case '<=':
				stack.push(`((${a}) <= (${b}) ? 1 : 0)`);
				break;
			case '>=':
				stack.push(`((${a}) >= (${b}) ? 1 : 0)`);
				break;
			case '==':
				stack.push(`((${a}) === (${b}) ? 1 : 0)`);
				break;
			case '!=':
				stack.push(`((${a}) !== (${b}) ? 1 : 0)`);
				break;
			case '&&':
				stack.push(`((${a}) !== 0 && (${b}) !== 0 ? 1 : 0)`);
				break;
			case '||':
				stack.push(`((${a}) !== 0 || (${b}) !== 0 ? 1 : 0)`);
				break;
			default:
				throw new Error(`Unhandled operator: ${item}`);
		}
	}
	if (stack.length !== 1) {
		throw new Error('Invalid expression');
	}
	return stack[0];
}

interface BlockExtraction {
	rewritten: string;
	blocks: Map<string, string>;
}

function extractBlocks(source: string, compileBlock: (content: string) => string): BlockExtraction {
	let rewritten = '';
	const blocks = new Map<string, string>();
	let i = 0;
	let blockId = 0;
	while (i < source.length) {
		const ch = source[i];
		if (ch !== '{') {
			rewritten += ch;
			i++;
			continue;
		}
		// find matching }
		let depth = 1;
		let j = i + 1;
		while (j < source.length && depth > 0) {
			if (source[j] === '{') {
				depth++;
			} else if (source[j] === '}') {
				depth--;
			}
			j++;
		}
		if (depth !== 0) {
			// unmatched brace, keep as-is
			rewritten += ch;
			i++;
			continue;
		}
		const inner = source.substring(i + 1, j - 1).trim();
		const placeholder = `__tuff_block_${blockId}__`;
		blockId++;
		blocks.set(placeholder, compileBlock(inner));
		rewritten += placeholder;
		i = j;
	}
	return { rewritten, blocks };
}

function compileExpression(expr: string): string {
	// First, compile any { ... } blocks into IIFEs and replace them with placeholder identifiers.
	const { rewritten, blocks } = extractBlocks(expr, compileBlockExpression);
	const tokens = tokenizeExpr(rewritten);
	let js = compileExprTokensToJs(tokens);
	for (const [ph, blockJs] of blocks) {
		js = js.replace(new RegExp(`\\b${ph}\\b`, 'g'), blockJs);
	}
	return js;
}

function compileStatementsToIife(stmts: string[]): string {
	if (stmts.length === 0) {
		return '0';
	}
	const lines: string[] = [];
	for (let i = 0; i < stmts.length - 1; i++) {
		lines.push(compileLetOrAssignStatement(stmts[i], compileExpression));
	}
	const last = stmts[stmts.length - 1];
	if (isLetStatement(last) || isReassignment(last)) {
		lines.push(compileLetOrAssignStatement(last, compileExpression));
		lines.push('return 0;');
	} else {
		lines.push(`return ${compileExpression(last)};`);
	}
	return `(() => {\n${lines.map((l: string): string => `  ${l}`).join('\n')}\n})()`;
}

function compileBlockExpression(blockContent: string): string {
	// A block is an expression: it evaluates its statements and yields the last expression (or 0).
	const stmts = splitTopLevelStatements(blockContent);
	return compileStatementsToIife(stmts);
}

function compileTopLevelToJs(source: string): string {
	const stmts = splitTopLevelStatements(source);
	return compileStatementsToIife(stmts);
}

/**
 * Generate code for multiple read<>() calls.
 *
 * @param source - source with read<>() placeholders
 * @returns generated JavaScript code
 */
export function generateMultiReadCode(source: string): string {
	const resultExpr = compileTopLevelToJs(source);
	const evaluationCode = `  const result = ${resultExpr};`;

	const parts = [
		"const readline = require('readline');",
		'const rl = readline.createInterface({',
		'  input: process.stdin,',
		'  output: process.stdout',
		'});',
		'let allInput = "";',
		"rl.on('line', (line) => {",
		'  allInput += line + " ";',
		'});',
		'rl.on("close", () => {',
		'  const values = allInput.trim().split(new RegExp("\\\\s+")).filter(v => v).map(v => {',
		'    if (v === "true") return 1;',
		'    if (v === "false") return 0;',
		'    return parseInt(v, 10);',
		'  });',
		evaluationCode,
		'  process.exit(result);',
		'});',
	];
	return parts.join('\n');
}
