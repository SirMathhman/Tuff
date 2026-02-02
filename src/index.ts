/* eslint-disable no-unused-vars */
type Env = Record<string, { value: number; mutable: boolean }>;

type ParserFn = (
  _source: string,
  _pos: number,
  _env: Env,
) => ParserResult;

type ConditionParserFn = (
  _source: string,
  _pos: number,
  _env: Env,
) => { condition: number; pos: number } | null;

type ParserResult = { value: number; pos: number };
/* eslint-enable no-unused-vars */

function parseNumericLiteral(
  source: string,
  start: number,
): { value: number; end: number } | null {
  let numEnd = start;
  while (
    numEnd < source.length &&
    source.charCodeAt(numEnd) >= 48 && // '0'
    source.charCodeAt(numEnd) <= 57 // '9'
  ) {
    numEnd++;
  }
  if (numEnd <= start) {
    return null;
  }
  // Skip type suffix (e.g., "U8", "I32")
  let suffixEnd = numEnd;
  while (
    suffixEnd < source.length &&
    ((source.charCodeAt(suffixEnd) >= 65 &&
      source.charCodeAt(suffixEnd) <= 90) || // 'A'-'Z'
      (source.charCodeAt(suffixEnd) >= 97 &&
        source.charCodeAt(suffixEnd) <= 122) || // 'a'-'z'
      (source.charCodeAt(suffixEnd) >= 48 &&
        source.charCodeAt(suffixEnd) <= 57)) // '0'-'9'
  ) {
    suffixEnd++;
  }
  return {
    value: parseInt(source.substring(start, numEnd), 10),
    end: suffixEnd,
  };
}

function parseIdentifier(
  source: string,
  start: number,
): { name: string; end: number } | null {
  let end = start;
  while (
    end < source.length &&
    ((source.charCodeAt(end) >= 97 && source.charCodeAt(end) <= 122) || // 'a'-'z'
      (source.charCodeAt(end) >= 65 && source.charCodeAt(end) <= 90) || // 'A'-'Z'
      (source.charCodeAt(end) >= 48 && source.charCodeAt(end) <= 57) || // '0'-'9'
      source.charCodeAt(end) === 95) // '_'
  ) {
    end++;
  }
  if (end <= start) {
    return null;
  }
  return {
    name: source.substring(start, end),
    end,
  };
}

function skipKeyword(
  source: string,
  start: number,
  keyword: string,
): number | null {
  const identifierResult = parseIdentifier(source, start);
  if (identifierResult && identifierResult.name === keyword) {
    return identifierResult.end;
  }
  return null;
}

function skipWhitespace(source: string, pos: number): number {
  while (pos < source.length && source.charCodeAt(pos) === 32) {
    // ' '
    pos++;
  }
  return pos;
}

function skipSemicolonAndWhitespace(source: string, pos: number): number {
  // Skip ';' if present
  if (source.charCodeAt(pos) === 59) {
    // ';'
    pos = pos + 1;
  }
  return skipWhitespace(source, pos);
}

// Helper for left-recursive binary operator parsing
function parseBinaryOperator(
  source: string,
  pos: number,
  env: Env,
  operandParser: ParserFn,
  operatorCodes: Array<number | number[]>,
  // eslint-disable-next-line no-unused-vars
  operators: Array<(left: number, right: number) => number>,
): ParserResult {
  const left = operandParser(source, pos, env);
  let result = left.value;
  pos = left.pos;

  while (pos < source.length) {
    const savedPos = pos;
    pos = skipWhitespace(source, pos);
    const charCode = source.charCodeAt(pos);

    let handlerIndex = -1;

    for (let i = 0; i < operatorCodes.length; i++) {
      const code = operatorCodes[i];
      if (Array.isArray(code)) {
        // Multi-character operator (e.g., [38, 38] for &&)
        if (
          charCode === code[0] &&
          source.charCodeAt(pos + 1) === code[1]
        ) {
          handlerIndex = i;
          pos = pos + code.length;
          break;
        }
      } else {
        // Single-character operator
        if (charCode === code) {
          handlerIndex = i;
          pos = pos + 1;
          break;
        }
      }
    }

    if (handlerIndex === -1) {
      pos = savedPos;
      break;
    }

    pos = skipWhitespace(source, pos);
    const right = operandParser(source, pos, env);
    const handler = operators[handlerIndex];
    if (handler) {
      result = handler(result, right.value);
    }
    pos = right.pos;
  }

  return { value: result, pos };
}

function parseIfCondition(
  source: string,
  pos: number,
  env: Env,
): { condition: number; pos: number } | null {
  pos = skipWhitespace(source, pos);

  // Parse condition in parentheses
  if (source.charCodeAt(pos) === 40) {
    // '('
    pos = skipWhitespace(source, pos + 1);
    const condResult = parseLogicalOr(source, pos, env);
    const condition = condResult.value;
    pos = skipWhitespace(source, condResult.pos);

    if (source.charCodeAt(pos) === 41) {
      // ')'
      pos = pos + 1;
    }
    pos = skipWhitespace(source, pos);

    return { condition, pos };
  }

  return null;
}

function getIfConditionAndPos(
  source: string,
  pos: number,
  env: Env,
): { condition: number; pos: number } | null {
  const condResult = parseIfCondition(source, pos, env);
  if (!condResult) {
    return null;
  }

  const { condition, pos: afterCond } = condResult;
  return { condition, pos: afterCond };
}

function parseIfConditional(
  source: string,
  pos: number,
  env: Env,
  branchParser: ParserFn,
): ParserResult {
  const condAndPos = getIfConditionAndPos(source, pos, env);
  if (!condAndPos) {
    return { value: 0, pos };
  }

  const { condition, pos: afterCond } = condAndPos;
  pos = afterCond;

  let result = 0;

  if (condition !== 0) {
    // Execute then branch
    const thenResult = branchParser(source, pos, env);
    result = thenResult.value;
    pos = skipWhitespace(source, thenResult.pos);

    pos = skipSemicolonAndWhitespace(source, pos);

    // Handle else branch (skip it)
    const elseResult = handleElseKeyword(source, pos, env, false, branchParser);
    pos = elseResult.pos;
  } else {
    // Skip then branch without executing it
    pos = skipStatement(source, pos);

    pos = skipSemicolonAndWhitespace(source, pos);

    // Handle else branch (execute it)
    const elseResult = handleElseKeyword(source, pos, env, true, branchParser);
    if (elseResult.foundElse) {
      result = elseResult.value;
    }
    pos = elseResult.pos;
  }

  pos = skipWhitespace(source, pos);
  return { value: result, pos };
}

function parseIfExpression(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  return parseIfConditional(source, pos, env, parseLogicalOr);
}

function checkKeywordControlFlow(
  source: string,
  pos: number,
  env: Env,
  parseIfHandler: ParserFn,
): ParserResult | null {
  // Check for 'let' keyword
  const letPos = skipKeyword(source, pos, 'let');
  if (letPos !== null) {
    return parseLetBinding(source, letPos, env);
  }

  // Check for 'if' keyword
  const ifPos = skipKeyword(source, pos, 'if');
  if (ifPos !== null) {
    return parseIfHandler(source, ifPos, env);
  }

  return null;
}

function parseParenthesizedExpr(
  source: string,
  pos: number,
  env: Env,
  exprParser: ParserFn,
): ParserResult | null {
  pos = skipWhitespace(source, pos);

  if (source.charCodeAt(pos) !== 40) {
    // '('
    return null;
  }
  pos = skipWhitespace(source, pos + 1);

  const result = exprParser(source, pos, env);
  pos = skipWhitespace(source, result.pos);

  if (source.charCodeAt(pos) === 41) {
    // ')'
    pos = pos + 1;
  }

  return { value: result.value, pos };
}

function parseMatch(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  // Parse the value to match in parentheses
  const parenResult = parseParenthesizedExpr(source, pos, env, parseLogicalOr);
  if (!parenResult) {
    return { value: 0, pos };
  }

  const matchValue = parenResult.value;
  pos = parenResult.pos;
  pos = skipWhitespace(source, pos);

  // Expect '{'
  if (source.charCodeAt(pos) !== 123) {
    // '{'
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, pos + 1);

  // Parse cases until closing brace
  let result = 0;
  let foundMatch = false;
  while (pos < source.length && source.charCodeAt(pos) !== 125) {
    // charCode 125 is '}'
    pos = skipWhitespace(source, pos);

    // Check for 'case' keyword
    const casePos = skipKeyword(source, pos, 'case');
    if (casePos === null) {
      break;
    }
    pos = skipWhitespace(source, casePos);

    // Parse pattern (either numeric literal or wildcard _)
    let patternMatches = false;

    // Check for wildcard pattern '_'
    if (source.charCodeAt(pos) === 95) {
      // '_'
      patternMatches = !foundMatch; // Only matches if nothing else has matched yet
      pos = pos + 1;
    } else {
      // Try to parse numeric literal pattern
      const patternLit = parseNumericLiteral(source, pos);
      if (patternLit) {
        patternMatches = !foundMatch && patternLit.value === matchValue;
        pos = patternLit.end;
      }
    }

    pos = skipWhitespace(source, pos);

    // Expect '=>'
    if (
      source.charCodeAt(pos) === 61 &&
      source.charCodeAt(pos + 1) === 62
    ) {
      // '=>'
      pos = pos + 2;
    }
    pos = skipWhitespace(source, pos);

    // Parse result expression
    const resultExpr = parseLogicalOr(source, pos, env);
    pos = skipWhitespace(source, resultExpr.pos);

    // If pattern matched, store result and mark as found
    if (patternMatches) {
      result = resultExpr.value;
      foundMatch = true;
    }

    // Skip semicolon
    pos = skipSemicolonAndWhitespace(source, pos);
  }

  // Expect closing brace '}'
  if (source.charCodeAt(pos) === 125) {
    // '}'
    pos = pos + 1;
  }

  return { value: result, pos };
}

function parsePrimary(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  pos = skipWhitespace(source, pos);

  // Check for opening parenthesis
  const parenResult = parseParenthesizedExpr(source, pos, env, parseAdditive);
  if (parenResult !== null) {
    return parenResult;
  }

  // Check for opening curly brace
  if (source.charCodeAt(pos) === 123) {
    // '{'
    pos = skipWhitespace(source, pos + 1);
    const result = parseBlock(source, pos, env);
    pos = skipWhitespace(source, result.pos);
    if (source.charCodeAt(pos) === 125) {
      // '}'
      pos = pos + 1;
    }
    return { value: result.value, pos };
  }

  // Check for control flow keywords (let, if)
  const keywordResult = checkKeywordControlFlow(source, pos, env, parseIfExpression);
  if (keywordResult !== null) {
    return keywordResult;
  }

  // Check for 'match' keyword
  const matchPos = skipKeyword(source, pos, 'match');
  if (matchPos !== null) {
    return parseMatch(source, matchPos, env);
  }

  // Check for boolean literals
  const truePos = skipKeyword(source, pos, 'true');
  if (truePos !== null) {
    return { value: 1, pos: truePos };
  }

  const falsePos = skipKeyword(source, pos, 'false');
  if (falsePos !== null) {
    return { value: 0, pos: falsePos };
  }

  // Check for identifier (variable lookup)
  const identifier = parseIdentifier(source, pos);
  if (identifier && identifier.name in env) {
    return { value: env[identifier.name]?.value ?? 0, pos: identifier.end };
  }

  // Otherwise parse numeric literal
  const numLiteral = parseNumericLiteral(source, pos);
  if (numLiteral) {
    return { value: numLiteral.value, pos: numLiteral.end };
  }

  return { value: 0, pos };
}

function parseLetBinding(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  pos = skipWhitespace(source, pos);

  // Check for 'mut' keyword
  let isMutable = false;
  const mutPos = skipKeyword(source, pos, 'mut');
  if (mutPos !== null) {
    isMutable = true;
    pos = skipWhitespace(source, mutPos);
  }

  // Parse variable name
  const identifier = parseIdentifier(source, pos);
  if (!identifier) {
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, identifier.end);

  // Type annotation is optional
  if (source.charCodeAt(pos) === 58) {
    // ':'
    pos = pos + 1;
    pos = skipWhitespace(source, pos);

    // Skip type name (e.g., "U8", "I32")
    const typeId = parseIdentifier(source, pos);
    if (typeId) {
      pos = skipWhitespace(source, typeId.end);
    }
  }

  // Skip '='
  if (source.charCodeAt(pos) === 61) {
    // '='
    pos = pos + 1;
  }
  pos = skipWhitespace(source, pos);

  // Parse initializer expression
  const initResult = parseLogicalOr(source, pos, env);
  const value = initResult.value;
  pos = skipWhitespace(source, initResult.pos);
  pos = skipSemicolonAndWhitespace(source, pos);

  // Create new environment with the binding
  const newEnv = { ...env, [identifier.name]: { value, mutable: isMutable } };

  // Parse body statement (which may contain another let binding)
  const bodyResult = parseStatement(source, pos, newEnv);
  return { value: bodyResult.value, pos: bodyResult.pos };
}

function parseBlock(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  let result = 0;
  pos = skipWhitespace(source, pos);

  // Parse statements until we hit closing brace
  while (pos < source.length && source.charCodeAt(pos) !== 125) {
    // charCode 125 is '}'
    const stmtResult = parseStatement(source, pos, env);
    result = stmtResult.value;
    pos = skipWhitespace(source, stmtResult.pos);
  }

  return { value: result, pos };
}

function skipStatement(
  source: string,
  pos: number,
): number {
  pos = skipWhitespace(source, pos);
  
  // Skip past the next statement-like construct
  // This is a simple approach: find the next semicolon or closing brace
  // Also stops at 'else' keyword to handle if-else chains
  let depth = 0;
  while (pos < source.length) {
    const code = source.charCodeAt(pos);
    
    // Found end of statement
    if (code === 59 && depth === 0) {
      // ';'
      return pos + 1;
    }
    
    // Found closing brace - don't consume it
    if (code === 125 && depth === 0) {
      // '}'
      return pos;
    }

    // Check for 'else' keyword at depth 0
    if (depth === 0 && code >= 97 && code <= 122) {
      // Potential identifier starting with lowercase letter
      const potentialElse = skipKeyword(source, pos, 'else');
      if (potentialElse !== null) {
        // Found 'else', stop here
        return pos;
      }
    }
    
    // Skip over strings/literals by skipping parentheses and braces
    if (code === 40 || code === 123) {
      // '(' or '{'
      depth++;
      pos++;
    } else if ((code === 41 || code === 125) && depth > 0) {
      // ')' or '}'
      depth--;
      pos++;
    } else {
      pos++;
    }
  }
  
  return pos;
}

function handleElseKeyword(
  source: string,
  pos: number,
  env: Env,
  shouldExecute: boolean,
  branchParser: ParserFn,
): { foundElse: boolean; value: number; pos: number } {
  const elsePos = skipKeyword(source, pos, 'else');
  if (elsePos === null) {
    return { foundElse: false, value: 0, pos };
  }

  pos = skipWhitespace(source, elsePos);
  let value = 0;

  if (shouldExecute) {
    const elseResult = branchParser(source, pos, env);
    value = elseResult.value;
    pos = skipWhitespace(source, elseResult.pos);
  } else {
    pos = skipStatement(source, pos);
  }

  pos = skipSemicolonAndWhitespace(source, pos);
  return { foundElse: true, value, pos };
}

function parseIfStatement(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  const ifResult = parseIfConditional(source, pos, env, parseStatement);

  // Check if there's more to parse (not at '}' or end)
  pos = ifResult.pos;
  if (pos < source.length && source.charCodeAt(pos) !== 125) {
    // charCode 125 is '}'
    const restResult = parseStatement(source, pos, env);
    return { value: restResult.value, pos: restResult.pos };
  } else {
    return ifResult;
  }
}

function parseWhile(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  // Parse initial condition to find where the body starts
  const condResult = parseIfCondition(source, pos, env);
  if (!condResult) {
    return { value: 0, pos };
  }

  const bodyStartPos = condResult.pos;
  let value = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 1024;

  while (iterations < MAX_ITERATIONS) {
    // Re-evaluate the condition each iteration
    const condCheckResult = parseIfCondition(source, pos, env);
    if (!condCheckResult || condCheckResult.condition === 0) {
      break;
    }

    // Execute body
    const bodyResult = parseStatement(source, bodyStartPos, env);
    value = bodyResult.value;
    let bodyEndPos = skipWhitespace(source, bodyResult.pos);

    // Skip semicolon if present
    bodyEndPos = skipSemicolonAndWhitespace(source, bodyEndPos);

    iterations++;
  }

  // Position after the while loop
  let finalPos = bodyStartPos;
  // Skip to the end of the loop body for final position
  // This is a simplified approach - in real code we'd need better tracking
  finalPos = skipStatement(source, bodyStartPos);

  return { value, pos: finalPos };
}

function parseFor(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  pos = skipWhitespace(source, pos);

  // Expect opening parenthesis
  if (source.charCodeAt(pos) !== 40) {
    // '('
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, pos + 1);

  // Parse loop variable name
  const loopVarIdent = parseIdentifier(source, pos);
  if (!loopVarIdent) {
    return { value: 0, pos };
  }
  const loopVarName = loopVarIdent.name;
  pos = skipWhitespace(source, loopVarIdent.end);

  // Expect 'in' keyword
  const inPos = skipKeyword(source, pos, 'in');
  if (inPos === null) {
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, inPos);

  // Parse range start
  const startNumResult = parseNumericLiteral(source, pos);
  if (!startNumResult) {
    return { value: 0, pos };
  }
  const rangeStart = startNumResult.value;
  pos = skipWhitespace(source, startNumResult.end);

  // Expect '..' (two dots)
  if (
    source.charCodeAt(pos) !== 46 ||
    source.charCodeAt(pos + 1) !== 46
  ) {
    // '.'
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, pos + 2);

  // Parse range end
  const endNumResult = parseNumericLiteral(source, pos);
  if (!endNumResult) {
    return { value: 0, pos };
  }
  const rangeEnd = endNumResult.value;
  pos = skipWhitespace(source, endNumResult.end);

  // Expect closing parenthesis
  if (source.charCodeAt(pos) !== 41) {
    // ')'
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, pos + 1);

  // Get body starting position
  const bodyStartPos = pos;

  let value = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 1024;

  // Loop through the range
  for (
    let i = rangeStart;
    i < rangeEnd && iterations < MAX_ITERATIONS;
    i++, iterations++
  ) {
    // Add loop variable to environment
    env[loopVarName] = { value: i, mutable: false };

    // Execute body
    const bodyResult = parseStatement(source, bodyStartPos, env);
    value = bodyResult.value;
    pos = skipWhitespace(source, bodyResult.pos);

    // Skip semicolon if present
    pos = skipSemicolonAndWhitespace(source, pos);
  }

  // Remove loop variable from environment
  delete env[loopVarName];

  return { value, pos };
}

function parseStatement(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  pos = skipWhitespace(source, pos);

  // Check for control flow keywords (let, if)
  const keywordResult = checkKeywordControlFlow(source, pos, env, parseIfStatement);
  if (keywordResult !== null) {
    return keywordResult;
  }

  // Check for 'while' keyword
  const whilePos = skipKeyword(source, pos, 'while');
  if (whilePos !== null) {
    return parseWhile(source, whilePos, env);
  }

  // Check for 'for' keyword
  const forPos = skipKeyword(source, pos, 'for');
  if (forPos !== null) {
    return parseFor(source, forPos, env);
  }

  // Try to parse assignment or expression
  return parseAssignmentOrExpression(source, pos, env);
}

function parseComparison(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  return parseBinaryOperator(
    source,
    pos,
    env,
    parseAdditive,
    [60], // <
    [
      (left: number, right: number) =>
        left < right ? 1 : 0,
    ],
  );
}

function parseLogicalAnd(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  return parseBinaryOperator(
    source,
    pos,
    env,
    parseComparison,
    [[38, 38]], // &&
    [
      (left: number, right: number) =>
        left !== 0 && right !== 0 ? 1 : 0,
    ],
  );
}

function parseLogicalOr(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  return parseBinaryOperator(
    source,
    pos,
    env,
    parseLogicalAnd,
    [[124, 124]], // ||
    [
      (left: number, right: number) =>
        left !== 0 || right !== 0 ? 1 : 0,
    ],
  );
}

function parseAssignmentOrExpression(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  const startPos = pos;
  pos = skipWhitespace(source, startPos);

  // Try to parse an identifier (potential assignment target)
  const identifier = parseIdentifier(source, pos);
  if (identifier) {
    const afterIdPos = skipWhitespace(source, identifier.end);
    const nextCode = source.charCodeAt(afterIdPos);
    const varName = identifier.name;

    // Check if variable is mutable
    if (varName in env && env[varName]?.mutable) {
      // Check for compound assignment operators: +=, -=, *=, /=
      if (
        nextCode === 43 || // '+'
        nextCode === 45 || // '-'
        nextCode === 42 || // '*'
        nextCode === 47    // '/'
      ) {
        if (source.charCodeAt(afterIdPos + 1) === 61) {
          // Compound assignment operator found
          const assignPos = skipWhitespace(source, afterIdPos + 2);

          // Parse RHS expression
          const rhsResult = parseLogicalOr(source, assignPos, env);
          const rhsValue = rhsResult.value;
          const currentValue = env[varName]!.value;

          // Apply the operator
          let newValue = currentValue;
          if (nextCode === 43) {
            // '+'
            newValue = currentValue + rhsValue;
          } else if (nextCode === 45) {
            // '-'
            newValue = currentValue - rhsValue;
          } else if (nextCode === 42) {
            // '*'
            newValue = currentValue * rhsValue;
          } else if (nextCode === 47) {
            // '/'
            newValue = currentValue / rhsValue;
          }

          return completeAssignment(source, rhsResult.pos, env, varName, newValue);
        }
      }

      // Check if this is followed by '='
      if (nextCode === 61) {
        // '=' - this is an assignment
        const assignPos = skipWhitespace(source, afterIdPos + 1);

        // Parse RHS expression
        const rhsResult = parseLogicalOr(source, assignPos, env);
        const newValue = rhsResult.value;

        return completeAssignment(source, rhsResult.pos, env, varName, newValue);
      }
    }
  }

  // Not an assignment, parse as normal expression
  const exprResult = parseLogicalOr(source, startPos, env);
  return exprResult;
}

function completeAssignment(
  source: string,
  pos: number,
  env: Env,
  varName: string,
  newValue: number,
): ParserResult {
  let exprPos = skipWhitespace(source, pos);
  exprPos = skipSemicolonAndWhitespace(source, exprPos);

  // Mutate the mutable variable in place
  env[varName]!.value = newValue;

  // Return the assigned value
  return { value: newValue, pos: exprPos };
}

function parseMultiplicative(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  return parseBinaryOperator(
    source,
    pos,
    env,
    parsePrimary,
    [42, 47], // * /
    [
      (left: number, right: number) => left * right,
      (left: number, right: number) => left / right,
    ],
  );
}

function parseAdditive(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  return parseBinaryOperator(
    source,
    pos,
    env,
    parseMultiplicative,
    [43, 45], // + -
    [
      (left: number, right: number) => left + right,
      (left: number, right: number) => left - right,
    ],
  );
}

export function interpret(source: string): number {
  if (source === "") {
    return 0;
  }

  const result = parseStatement(source, 0, {});
  return result.value;
}
