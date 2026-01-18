/**
 * Code generation for Tuff expressions.
 * Generates JavaScript code that evaluates Tuff expressions at runtime.
 */

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

/**
 * Generate the evaluateExpr helper function.
 *
 * @returns lines for evaluateExpr
 */
/**
 * Generate code for handling multiplication/division and addition/subtraction.
 *
 * @returns lines for evaluateTokens function
 */
function generateEvaluateTokensHelper(): string[] {
	return [
		'function evaluateTokens(tokens) {',
		'  const cleanInt = (s) => {',
		'    const c = String(s).replace(new RegExp("[(){};]", "g"), "");',
		'    if (c === "true") return 1;',
		'    if (c === "false") return 0;',
		'    return parseInt(c, 10);',
		'  };',
		'  let i = 0;',
		'  while (i < tokens.length) {',
		'    if (i > 0 && i < tokens.length - 1 && (tokens[i] === "*" || tokens[i] === "/")) {',
		'      const l = cleanInt(tokens[i - 1]), r = cleanInt(tokens[i + 1]);',
		'      const res = tokens[i] === "*" ? l * r : Math.floor(l / r);',
		'      tokens.splice(i - 1, 3, String(res));',
		'    } else { i++; }',
		'  }',
		'  if (tokens.length === 0) return 0;',
		'  let result = cleanInt(tokens[0]);',
		'  for (let j = 1; j < tokens.length; j += 2) {',
		'    if (j + 1 < tokens.length) {',
		'      const o = cleanInt(tokens[j + 1]);',
		'      if (tokens[j] === "+") result += o;',
		'      else if (tokens[j] === "-") result -= o;',
		'      else if (tokens[j] === "%") result %= o;',
		'    }',
		'  }',
		'  return Math.floor(result);',
		'}',
	];
}

/**
 * Generate code to evaluate let bindings or reassignments within a block.
 *
 * @returns lines for statement evaluation
 */
function generateBlockStatementHelper(): string[] {
	return [
		'      let varName, expr;',
		'      const trimmed = stmt.trim();',
		'      if (trimmed.startsWith("let ")) {',
		'        let afterLet = trimmed.substring(4).trim();',
		'        if (afterLet.startsWith("mut ")) afterLet = afterLet.substring(4).trim();',
		'        const equalsIdx = afterLet.indexOf("=");',
		'        const colonIdx = afterLet.indexOf(":");',
		'        if (colonIdx !== -1 && colonIdx < equalsIdx) {',
		'          varName = afterLet.substring(0, colonIdx).trim();',
		'          expr = afterLet.substring(equalsIdx + 1).trim();',
		'        } else if (equalsIdx !== -1) {',
		'          varName = afterLet.substring(0, equalsIdx).trim();',
		'          expr = afterLet.substring(equalsIdx + 1).trim();',
		'        }',
		'      } else {',
		'        const reassignmentMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\\s*=(.*)$/s);',
		'        if (reassignmentMatch) {',
		'          varName = reassignmentMatch[1].trim();',
		'          expr = reassignmentMatch[2].trim();',
		'        }',
		'      }',
		'      if (varName && expr) {',
		'        let exprEval = expr;',
		'        for (const [vName, vValue] of Object.entries(bindings)) {',
		'          const regex = new RegExp("\\\\b" + vName + "\\\\b", "g");',
		'          exprEval = exprEval.replace(regex, String(vValue));',
		'        }',
		'        bindings[varName] = processAndEvaluate(exprEval, values);',
		'      }',
	];
}

/**
 * Generate the evaluateBlock helper function.
 *
 * @returns lines for evaluateBlock
 */
function generateEvaluateBlockHelper(): string[] {
	const statementCode = generateBlockStatementHelper();
	return [
		'function evaluateBlock(blockContent, values, readIdx) {',
		'  const bindings = {};',
		'  const splitStatements = (s) => {',
		'    const stmts = []; let curr = "", depth = 0;',
		'    for (let i = 0; i < s.length; i++) {',
		'      if (s[i] === "{") depth++; else if (s[i] === "}") depth--;',
		'      if (s[i] === ";" && depth === 0) { stmts.push(curr.trim()); curr = ""; } else curr += s[i];',
		'    }',
		'    if (curr.trim()) stmts.push(curr.trim());',
		'    return stmts.filter(x => x);',
		'  };',
		'  const statements = splitStatements(blockContent);',
		'  if (statements.length === 0) return 0;',
		'  for (let i = 0; i < statements.length - 1; i++) {',
		'    const stmt = statements[i];',
		...statementCode,
		'  }',
		'  const lastStmt = statements[statements.length - 1];',
		'  const trimmedLast = lastStmt.trim();',
		'  if (trimmedLast.startsWith("let ") || (new RegExp("^([a-zA-Z_][a-zA-Z0-9_]*)\\\\s*=")).test(trimmedLast)) {',
		'    const stmt = lastStmt;',
		...statementCode,
		'    return 0;',
		'  }',
		'  let lastEval = lastStmt;',
		'  for (const [vName, vValue] of Object.entries(bindings)) {',
		'    const regex = new RegExp("\\\\b" + vName + "\\\\b", "g");',
		'    lastEval = lastEval.replace(regex, String(vValue));',
		'  }',
		'  return processAndEvaluate(lastEval, values);',
		'}',
	];
}

/**
 * Generate minimal helper functions needed for expression evaluation.
 * Only includes helpers actually called by the generated code.
 *
 * @returns JavaScript code for required helper functions
 */
function generateMinimalHelpers(): string {
	const countCharLines = [
		'function countChar(s, c) { let count = 0; for (let i = 0; i < s.length; i++) if (s[i] === c) count++; return count; }',
	];
	const evaluateTokensLines = generateEvaluateTokensHelper();
	const evaluateBlockLines = generateEvaluateBlockHelper();

	const lines = [...countCharLines, ...evaluateTokensLines, ...evaluateBlockLines];
	return lines.join('\n');
}

/**
 * Generate code that handles grouped expressions (parentheses/braces).
 *
 * @returns JavaScript code string
 */
/**
 * Helper function to evaluate block result with before/after expressions.
 *
 * @returns expression with block result
 */
function generateBlockEvalExpr(): string {
	return `
        const delimClean = (s) => s.split("(").join("").split(")").join("").trim();
        const beforeClean = delimClean(beforeBrace);
        const afterClean = delimClean(afterBrace);
        const blockVal = evaluateBlock(braceContent, values, 0);
      exprToEval = beforeClean ? (beforeClean + " " + blockVal) : String(blockVal);
      if (afterClean) exprToEval = exprToEval + " " + afterClean;`;
}

export function generateGroupedExprCode(): string {
	return `  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].includes("(") || tokens[i].includes("{")) {
      let pCount = 0, sIdx = i, eIdx = i;
      let delim = "(";
      let close = ")";
      if (tokens[i].includes("{")) {
        delim = "{";
        close = "}";
      }
      for (let j = i; j < tokens.length; j++) {
        pCount += countChar(tokens[j], delim) - countChar(tokens[j], close);
        if (pCount === 0) { eIdx = j; break; }
      }
      
      const blockTokens = tokens.slice(sIdx, eIdx + 1);
      const blockStr = blockTokens.join(" ");
      
      let exprToEval = "";
      if (blockStr.includes("{") && blockStr.includes("let ")) {
        const braceStart = blockStr.indexOf("{");
        const braceEnd = blockStr.lastIndexOf("}");
        const beforeBrace = blockStr.substring(0, braceStart).trim();
        const braceContent = blockStr.substring(braceStart + 1, braceEnd).trim();
        const afterBrace = blockStr.substring(braceEnd + 1).trim();
        ${generateBlockEvalExpr()}
      } else {
        const iTok = blockTokens.map(t => t.split("(").join("").split(")").join("").split("{").join("").split("}").join(""));
        exprToEval = iTok.filter(t => t).join(" ");
      }
      
      const resVal = processAndEvaluate(exprToEval, values);
      tokens.splice(sIdx, eIdx - sIdx + 1, String(resVal));
    } else { i++; }
  }`;
}

/**
 * Generate code for handling multiplication/division.
 *
 * @returns JavaScript code string
 */
export function generateMultDivCode(): string {
	return '';
}

/**
 * Generate code for handling addition/subtraction.
 *
 * @returns JavaScript code string
 */
export function generateAddSubCode(): string {
	return '  return evaluateTokens(tokens);';
}

/**
 * Build the main evaluation function as code string.
 *
 * @returns string
 */
export function buildEvalFunction(): string {
	const groupCode = generateGroupedExprCode();
	const addSubCode = generateAddSubCode();
	return `function processAndEvaluate(input, values) {
  const cleanInt = (s) => {
    const c = String(s).replace(new RegExp("[(){};]", "g"), "");
    if (c === "true") return 1;
    if (c === "false") return 0;
    return parseInt(c, 10);
  };
  let tokens = Array.isArray(input) ? [...input] : input.split(new RegExp("\\\\s+")).filter(t => t);
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx], start = t.indexOf("values["), end = start > -1 ? t.indexOf("]", start) : -1;
    if (start > -1 && end > -1) {
      const valIdx = parseInt(t.substring(start + 7, end), 10);
      tokens[idx] = t.substring(0, start) + values[valIdx] + t.substring(end + 1);
    }
  }
  if (tokens.length === 1 && !tokens[0].includes("(") && !tokens[0].includes("{")) {
    return cleanInt(tokens[0]);
  }
${groupCode}
${addSubCode}
}`;
}

/**
 * Generate code for processing and evaluating tokens with operator precedence.
 *
 * @returns JavaScript code as string
 */
export function generateTokenProcessingCode(): string {
	return `${generateMinimalHelpers()}\n${buildEvalFunction()}`;
}

/**
 * Generate code to evaluate a Tuff expression.
 *
 * @param exprStr - expression string
 * @param resultVar - variable name to store result
 * @returns generated JavaScript code
 */
function generateEvalSnippet(exprStr: string, resultVar: string): string {
	return `  const expr = '${exprStr}';
  const tokens = expr.split(" ").filter(t => t);
  const ${resultVar} = processAndEvaluate(tokens, values);`;
}

/**
 * Generate code for multiple read<>() calls.
 *
 * @param source - source with read<>() placeholders
 * @returns generated JavaScript code
 */
export function generateMultiReadCode(source: string): string {
	const processingCode = generateTokenProcessingCode();
	let evaluationCode = '';

	const trimmed = source.trim();
	const hasStatement = trimmed.startsWith('let ') || trimmed.includes('=');
	const hasSemicolon = trimmed.includes(';');
	const notInBraces = !trimmed.startsWith('{');

	if (hasStatement && hasSemicolon && notInBraces) {
		evaluationCode = `  const result = evaluateBlock(${JSON.stringify(source)}, values, 0);`;
	} else {
		evaluationCode = generateEvalSnippet(source, 'result');
	}

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
		processingCode,
		evaluationCode,
		'  process.exit(result);',
		'});',
	];
	return parts.join('\n');
}
