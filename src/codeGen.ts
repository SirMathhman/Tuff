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
		'  const value = parseInt(line.trim(), 10);',
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
		'  const value = parseInt(line.trim(), 10);',
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
 * Generate minimal helper functions needed for expression evaluation.
 * Only includes helpers actually called by the generated code.
 *
 * @returns JavaScript code for required helper functions
 */
function generateMinimalHelpers(): string {
	const lines = [
		'const countChar = (s, c) => { let count = 0; for (let i = 0; i < s.length; i++) if (s[i] === c) count++; return count; };',
		'const evaluateExpr = (exprStr) => {',
		'  const parts = exprStr.split(" ").filter(p => p);',
		'  if (parts.length === 1) return parseInt(parts[0], 10);',
		'  let i = 0;',
		'  while (i < parts.length) {',
		'    if (i > 0 && i < parts.length - 1 && (parts[i] === "*" || parts[i] === "/")) {',
		'      const l = parseInt(parts[i - 1], 10), r = parseInt(parts[i + 1], 10);',
		'      parts.splice(i - 1, 3, (parts[i] === "*" ? l * r : Math.floor(l / r)).toString());',
		'    } else { i++; }',
		'  }',
		'  let res = parseInt(parts[0], 10);',
		'  for (let j = 1; j < parts.length; j += 2) {',
		'    const o = parseInt(parts[j + 1], 10);',
		'    res = parts[j] === "+" ? res + o : parts[j] === "-" ? res - o : res % o;',
		'  }',
		'  return res;',
		'};',
		'const evaluateBlock = (blockContent, values, readIdx) => {',
		'  const bindings = {};',
		'  const statements = blockContent.split(";").map(s => s.trim()).filter(s => s);',
		'  for (let i = 0; i < statements.length - 1; i++) {',
		'    const stmt = statements[i];',
		'    if (stmt.startsWith("let ")) {',
		'      const match = stmt.match(/let\\s+(\\w+)\\s*:\\s*\\w+\\s*=\\s*(.+)/);',
		'      if (match) {',
		'        const varName = match[1];',
		'        const expr = match[2];',
		'        let exprEval = expr;',
		'        for (const [vName, vValue] of Object.entries(bindings)) {',
		'          const regex = new RegExp(`\\\\b${vName}\\\\b`, "g");',
		'          exprEval = exprEval.replace(regex, String(vValue));',
		'        }',
		'        bindings[varName] = evaluateExpr(exprEval);',
		'      }',
		'    }',
		'  }',
		'  const lastStmt = statements[statements.length - 1];',
		'  let lastEval = lastStmt;',
		'  for (const [vName, vValue] of Object.entries(bindings)) {',
		'    const regex = new RegExp(`\\\\b${vName}\\\\b`, "g");',
		'    lastEval = lastEval.replace(regex, String(vValue));',
		'  }',
		'  return evaluateExpr(lastEval);',
		'};',
	];
	return lines.join('\n');
}

/**
 * Generate code that handles grouped expressions (parentheses/braces).
 *
 * @returns JavaScript code string
 */
// eslint-disable-next-line max-lines-per-function
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
      
      // Determine the expression to evaluate
      let exprToEval = "";
      if (blockStr.includes("{") && blockStr.includes("let ")) {
        // Extract content inside braces
        const braceStart = blockStr.indexOf("{");
        const braceEnd = blockStr.lastIndexOf("}");
        const beforeBrace = blockStr.substring(0, braceStart).trim();
        const braceContent = blockStr.substring(braceStart + 1, braceEnd).trim();
        const afterBrace = blockStr.substring(braceEnd + 1).trim();
        
        // Remove delimiters from before/after brace
        const delimClean = (s) => s.split("(").join("").split(")").join("").trim();
        const beforeClean = delimClean(beforeBrace);
        const afterClean = delimClean(afterBrace);
        
        // Evaluate the let-binding block
        const blockResult = evaluateBlock(braceContent, values, 0);
        
        // Reconstruct and evaluate expression with block result
        exprToEval = beforeClean ? (beforeClean + " " + blockResult) : String(blockResult);
        if (afterClean) exprToEval = exprToEval + " " + afterClean;
      } else {
        let iTok = blockTokens.map(t => t.split("(").join("").split(")").join("").split("{").join("").split("}").join(""));
        iTok = iTok.filter(t => t);
        exprToEval = iTok.join(" ");
      }
      
      // Evaluate and replace
      const result = evaluateExpr(exprToEval);
      tokens.splice(sIdx, eIdx - sIdx + 1, String(result));
    } else { i++; }
  }`;
}

/**
 * Generate code for handling multiplication/division.
 *
 * @returns JavaScript code string
 */
export function generateMultDivCode(): string {
	return `  i = 0;
  while (i < tokens.length) {
    if (i > 0 && i < tokens.length - 1 && (tokens[i] === "*" || tokens[i] === "/")) {
      const l = parseInt(tokens[i - 1], 10), r = parseInt(tokens[i + 1], 10);
      const res = tokens[i] === "*" ? l * r : Math.floor(l / r);
      tokens.splice(i - 1, 3, res.toString());
    } else { i++; }
  }`;
}

/**
 * Generate code for handling addition/subtraction.
 *
 * @returns JavaScript code string
 */
export function generateAddSubCode(): string {
	return `  let result = parseInt(tokens[0], 10);
  for (let j = 1; j < tokens.length; j += 2) {
    const o = parseInt(tokens[j + 1], 10);
    result = tokens[j] === "+" ? result + o : tokens[j] === "-" ? result - o : result % o;
  }
  return result;`;
}

/**
 * Build the main evaluation function as code string.
 *
 * @returns string
 */
export function buildEvalFunction(): string {
	const groupCode = generateGroupedExprCode();
	const multDivCode = generateMultDivCode();
	const addSubCode = generateAddSubCode();
	return `const processAndEvaluate = (tokens, values) => {
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx], start = t.indexOf("values["), end = start > -1 ? t.indexOf("]", start) : -1;
    if (start > -1 && end > -1) {
      const valIdx = parseInt(t.substring(start + 7, end), 10);
      tokens[idx] = t.substring(0, start) + values[valIdx] + t.substring(end + 1);
    }
  }
${groupCode}
${multDivCode}
${addSubCode}
};`;
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
 * Generate code for multiple read<>() calls.
 *
 * @param source - source with read<>() placeholders
 * @returns generated JavaScript code
 */
export function generateMultiReadCode(source: string): string {
	const processingCode = generateTokenProcessingCode();
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
		'  const values = allInput.trim().split(" ").map(v => parseInt(v, 10));',
		'  const expr = ' + `'${source}'` + ';',
		'  const tokens = expr.split(" ").filter(t => t);',
		processingCode,
		'  const result = processAndEvaluate(tokens, values);',
		'  process.exit(result);',
		'});',
	];
	return parts.join('\n');
}
