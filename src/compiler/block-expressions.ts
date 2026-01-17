function isWhitespace(ch: string): boolean {
	return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function isIdentifierChar(ch: string): boolean {
	const code = ch.charCodeAt(0);
	if (code >= 48 && code <= 57) {
		return true;
	}
	if (code >= 65 && code <= 90) {
		return true;
	}
	if (code >= 97 && code <= 122) {
		return true;
	}
	return ch === '_';
}

function isKeywordBoundary(ch: string | undefined): boolean {
	if (ch === undefined) {
		return true;
	}
	return !isIdentifierChar(ch);
}

function isKeywordAt(code: string, index: number, keyword: string): boolean {
	if (index < 0) {
		return false;
	}
	if (index + keyword.length > code.length) {
		return false;
	}
	if (code.substring(index, index + keyword.length) !== keyword) {
		return false;
	}
	let before: string | undefined;
	if (index > 0) {
		before = code[index - 1];
	}
	let after: string | undefined;
	if (index + keyword.length < code.length) {
		after = code[index + keyword.length];
	}
	if (!isKeywordBoundary(before)) {
		return false;
	}
	if (!isKeywordBoundary(after)) {
		return false;
	}
	return true;
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

function splitTopLevelStatements(block: string): string[] {
	const parts: string[] = [];
	let start = 0;
	let parenDepth = 0;
	let braceDepth = 0;
	let bracketDepth = 0;

	let i = 0;
	while (i < block.length) {
		const ch = block[i];

		// Check for control flow keywords at depth 0
		if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
			// Check for if/while/for/match keywords
			if (
				isKeywordAt(block, i, 'if') ||
				isKeywordAt(block, i, 'while') ||
				isKeywordAt(block, i, 'for') ||
				isKeywordAt(block, i, 'match')
			) {
				// Find the keyword length
				let keywordLen = 2;
				if (isKeywordAt(block, i, 'while') || isKeywordAt(block, i, 'match')) {
					keywordLen = 5;
				} else if (isKeywordAt(block, i, 'for')) {
					keywordLen = 3;
				}

				// Skip to condition
				let j = i + keywordLen;
				while (j < block.length && isWhitespace(block[j])) {
					j++;
				}

				// Parse condition (skip parens or match expression)
				if (block[j] === '(') {
					let depth = 1;
					j++;
					while (j < block.length && depth > 0) {
						if (block[j] === '(') {
							depth++;
						} else if (block[j] === ')') {
							depth--;
						}
						j++;
					}
				}

				// Skip whitespace after condition
				while (j < block.length && isWhitespace(block[j])) {
					j++;
				}

				// Parse body (could be block or single statement)
				if (block[j] === '{') {
					// Block body - find matching brace
					let depth = 1;
					j++;
					while (j < block.length && depth > 0) {
						if (block[j] === '{') {
							depth++;
						} else if (block[j] === '}') {
							depth--;
						}
						j++;
					}
				} else {
					// Single statement - find semicolon or else keyword
					while (j < block.length) {
						if (block[j] === ';') {
							j++;
							break;
						}
						if (isKeywordAt(block, j, 'else')) {
							break;
						}
						j++;
					}
				}

				// If this was an if statement, check for else
				if (isKeywordAt(block, i, 'if')) {
					// Skip whitespace
					while (j < block.length && isWhitespace(block[j])) {
						j++;
					}

					if (isKeywordAt(block, j, 'else')) {
						j += 4;

						// Skip whitespace
						while (j < block.length && isWhitespace(block[j])) {
							j++;
						}

						// Parse else body (could be if, block, or statement)
						if (isKeywordAt(block, j, 'if')) {
						// else if - recursively parse the nested if-else
						// We need to find where the nested if ends
						// Save current position
						const nestedIfStart = j;

						// Call ourselves recursively by simulating the if parsing
						// Actually, let's just parse it manually inline

						// Skip 'if'
						j += 2;

						// Skip whitespace
						while (j < block.length && isWhitespace(block[j])) {
							j++;
						}

						// Parse condition
						if (block[j] === '(') {
							let depth = 1;
							j++;
							while (j < block.length && depth > 0) {
								if (block[j] === '(') {
									depth++;
								} else if (block[j] === ')') {
									depth--;
								}
								j++;
							}
						}

						// Skip whitespace
						while (j < block.length && isWhitespace(block[j])) {
							j++;
						}

						// Parse then branch
						if (block[j] === '{') {
							let depth = 1;
							j++;
							while (j < block.length && depth > 0) {
								if (block[j] === '{') {
									depth++;
								} else if (block[j] === '}') {
									depth--;
								}
								j++;
							}
						} else {
							while (j < block.length) {
								if (block[j] === ';') {
									j++;
									break;
								}
								if (isKeywordAt(block, j, 'else')) {
									break;
								}
								j++;
							}
						}

						// Check for else after nested if
						while (j < block.length && isWhitespace(block[j])) {
							j++;
						}

						if (isKeywordAt(block, j, 'else')) {
							// There's another else - continue parsing
							// Set i to continue from this else for next iteration
							// But actually we want to keep parsing this entire chain
							// Let's use a loop
							j += 4;
							while (j < block.length && isWhitespace(block[j])) {
								j++;
							}

							// Parse this else branch
							if (block[j] === '{') {
								let depth = 1;
								j++;
								while (j < block.length && depth > 0) {
									if (block[j] === '{') {
										depth++;
									} else if (block[j] === '}') {
										depth--;
									}
									j++;
								}
							} else if (!isKeywordAt(block, j, 'if')) {
								// Single statement
								while (j < block.length && block[j] !== ';') {
									j++;
								}
								if (j < block.length && block[j] === ';') {
									j++;
								}
							}
						}
						} else if (block[j] === '{') {
							// Block body
							let depth = 1;
							j++;
							while (j < block.length && depth > 0) {
								if (block[j] === '{') {
									depth++;
								} else if (block[j] === '}') {
									depth--;
								}
								j++;
							}
						} else {
							// Single statement
							while (j < block.length && block[j] !== ';') {
								j++;
							}
							if (j < block.length && block[j] === ';') {
								j++;
							}
						}
					}
				}

				// Add the complete control flow statement
				parts.push(block.substring(start, j).trim());
				start = j;
				i = j;
				continue;
			}
		}

		if (ch === '(') {
			parenDepth = parenDepth + 1;
		}
		if (ch === ')') {
			parenDepth = parenDepth - 1;
		}
		if (ch === '{') {
			braceDepth = braceDepth + 1;
		}
		if (ch === '}') {
			braceDepth = braceDepth - 1;
		}
		if (ch === '[') {
			bracketDepth = bracketDepth + 1;
		}
		if (ch === ']') {
			bracketDepth = bracketDepth - 1;
		}

		if (ch === ';' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
			parts.push(block.substring(start, i).trim());
			start = i + 1;
		}

		i = i + 1;
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

interface UninitTracker {
	varName: string;
}

function extractVarName(letStatement: string): string | undefined {
	const trimmed = letStatement.trim();
	if (!trimmed.startsWith('let ')) {
		return undefined;
	}
	const afterLet = trimmed.substring(4).trim();
	const match = afterLet.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
	if (!match) {
		return undefined;
	}
	return match[1];
}

function wrapUninitializedCheck(expr: string, uninitVars: Set<string>): string {
	// If expr is a simple identifier in the uninitialized set, wrap it
	const trimmed = expr.trim();
	if (uninitVars.has(trimmed)) {
		return `(()=>{if(${trimmed}===Symbol.for('__uninitialized__'))throw new Error("Variable '${trimmed}' is not initialized");return ${trimmed};})()`;
	}
	return expr;
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
			// Track uninitialized variable
			const varName = extractVarName(stmt);
			if (varName !== undefined) {
				uninitVars.add(varName);
			}
			// Initialize with a sentinel value
			bodyParts.push(`${stmt} = Symbol.for('__uninitialized__');`);
		} else {
			// Check if this is an assignment that initializes a tracked variable
			const assignMatch = stmt.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
			if (assignMatch) {
				uninitVars.delete(assignMatch[1]);
			}
			bodyParts.push(`${stmt};`);
		}
		i = i + 1;
	}
	const body = bodyParts.join('');

	if (last.trim().startsWith('let ')) {
		if (isUninitializedLet(last)) {
			return `(() => { ${body}${last} = Symbol.for('__uninitialized__'); return 0; })()`;
		}
		return `(() => { ${body}${last}; return 0; })()`;
	}

	// Check if last statement is already a complete statement (if/while/for with returns/yields)
	const lastTrimmed = last.trim();
	if (lastTrimmed.startsWith('if ') && (lastTrimmed.includes('return') || lastTrimmed.includes('yield'))) {
		// If-statement with returns/yields - don't add another return
		return `(() => { ${body}${last}; })()`;
	}

	// Wrap the last expression with uninitialized checks
	const wrappedLast = wrapUninitializedCheck(last, uninitVars);
	return `(() => { ${body}return ${wrappedLast}; })()`;
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

	if (j >= code.length) {
		return {
			text: parts.join(''),
			nextIndex: j,
		};
	}
	if (code[j] !== ':') {
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
	while (j < code.length && code[j] !== '=' && code[j] !== ';') {
		j = j + 1;
	}

	return {
		text: parts.join(''),
		nextIndex: j,
	};
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

		// Check if this block is preceded by a control flow keyword
		// Look backwards to find if this is part of if/while/for/match/else
		let j = i - 1;
		while (j >= 0 && isWhitespace(code[j])) {
			j--;
		}

		// Check for closing paren (condition) before the block
		let isControlFlowBlock = false;
		if (j >= 0 && code[j] === ')') {
			// Find matching opening paren
			let depth = 1;
			j--;
			while (j >= 0 && depth > 0) {
				if (code[j] === ')') {
					depth++;
				} else if (code[j] === '(') {
					depth--;
				}
				j--;
			}

			// Skip whitespace before paren
			while (j >= 0 && isWhitespace(code[j])) {
				j--;
			}

			// Check for control flow keyword ending at position j
			// Try all keywords
			if (j >= 1 && isKeywordAt(code, j - 1, 'if')) {
				isControlFlowBlock = true;
			} else if (j >= 2 && isKeywordAt(code, j - 2, 'for')) {
				isControlFlowBlock = true;
			} else if (j >= 4 && isKeywordAt(code, j - 4, 'while')) {
				isControlFlowBlock = true;
			} else if (j >= 4 && isKeywordAt(code, j - 4, 'match')) {
				isControlFlowBlock = true;
			}
		} else if (j >= 3 && isKeywordAt(code, j - 3, 'else')) {
			// Block directly after 'else'
			isControlFlowBlock = true;
		}

		if (isControlFlowBlock) {
			// Keep the block as-is, but recursively process its contents
			const closeIndex = findMatchingBrace(code, i);
			if (closeIndex === undefined) {
				parts.push(ch);
				i = i + 1;
				continue;
			}

			const inner = code.substring(i + 1, closeIndex);
			const compiledInner = compileBracedExpressionsToIife(inner);
			parts.push('{');
			parts.push(compiledInner);
			parts.push('}');
			i = closeIndex + 1;
			continue;
		}

		const closeIndex = findMatchingBrace(code, i);
		if (closeIndex === undefined) {
			parts.push(ch);
			i = i + 1;
			continue;
		}

		const inner = code.substring(i + 1, closeIndex);
		const compiledInner = compileBracedExpressionsToIife(inner);
		parts.push(compileBlockExpression(compiledInner));
		i = closeIndex + 1;
	}

	return parts.join('');
}