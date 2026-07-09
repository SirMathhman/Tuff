use std::collections::HashMap;

#[derive(Debug)]
pub enum ParseError {
    UnexpectedEndOfInput,
    MissingVariableName,
    MissingEqualsSign,
    ImmutableReassignment(String),
    UnknownIdentifier(String),
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParseError::UnexpectedEndOfInput => write!(f, "unexpected end of input"),
            ParseError::MissingVariableName => write!(f, "missing variable name after 'let'"),
            ParseError::MissingEqualsSign => write!(f, "expected '=' after variable name"),
            ParseError::ImmutableReassignment(name) => {
                write!(f, "cannot reassign immutable variable '{}'", name)
            }
            ParseError::UnknownIdentifier(name) => {
                write!(f, "unknown identifier '{}'", name)
            }
        }
    }
}

type ScopeFrame = HashMap<String, (i64, bool)>;

/// Nested scope stack — innermost frame is last element.
pub struct Scope(Vec<ScopeFrame>);

impl Scope {
    pub fn new() -> Self {
        Scope(vec![ScopeFrame::new()])
    }

    /// Push a new local scope (for blocks).
    pub fn push(&mut self) {
        self.0.push(ScopeFrame::new());
    }

    /// Pop the innermost scope.
    pub fn pop(&mut self) {
        if self.0.len() > 1 {
            self.0.pop();
        }
    }

    /// Look up a variable from innermost to outermost scope.
    pub fn get(&self, name: &str) -> Option<&(i64, bool)> {
        self.0.iter().rev().find_map(|frame| frame.get(name))
    }

    /// Check if a variable exists in any scope level.
    pub fn contains_key(&self, name: &str) -> bool {
        self.0.iter().any(|frame| frame.contains_key(name))
    }
}

/// Entry point — tokenize and parse source string into an integer result.
pub fn interpret(source: &str) -> Result<i64, String> {
    use crate::lexer;
    let tokens = lexer::tokenize(source);
    if tokens.is_empty() {
        return Ok(0);
    }
    // Scope maps variable name to (value, is_mut)
    let mut scope = Scope::new();
    parse_statements(&tokens, &mut 0, &mut scope).map_err(|e| e.to_string())
}

/// Parse a sequence of statements (let-declarations or expressions), returning the last expression value.
fn parse_statements(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<i64, ParseError> {
    parse_statement_list(tokens, pos, scope, None)
}

/// Parse the condition inside `if (...)` — skips optional parens and evaluates expression.
fn parse_if_condition(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<i64, ParseError> {
    if *pos < tokens.len() && tokens[*pos] == "(" {
        *pos += 1; // skip "("
    }
    let cond = parse_expression(tokens, pos, scope)?;
    if *pos < tokens.len() && tokens[*pos] == ")" {
        *pos += 1; // skip ")"
    }
    Ok(cond)
}

/// Parse the body of an if/else branch (block or single statement).
fn parse_if_body(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<i64, ParseError> {
    if *pos < tokens.len() && tokens[*pos] == "{" {
        // Block body — consume delimiters like parse_factor does
        *pos += 1; // skip "{"
        let val = parse_block(tokens, pos, scope)?;
        if *pos < tokens.len() && tokens[*pos] == "}" {
            *pos += 1; // skip "}"
        }
        Ok(val)
    } else {
        // Single-statement body — shares parent scope
        let result = parse_expression(tokens, pos, scope)?;
        consume_semicolon(pos, tokens);
        Ok(result)
    }
}

/// Parse an `if (condition) stmt [else stmt]` statement. Returns Some(()) if it consumed tokens, None otherwise.
fn parse_if_statement(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<Option<()>, ParseError> {
    if *pos >= tokens.len() || tokens[*pos] != "if" {
        return Ok(None);
    }
    *pos += 1; // skip "if"
    let cond = parse_if_condition(tokens, pos, scope)?;

    // Parse then-body (always parsed to advance position)
    let _then_val = parse_if_body(tokens, pos, scope)?;

    // Handle optional `else` branch
    if *pos < tokens.len() && tokens[*pos] == "else" {
        *pos += 1; // skip "else"
        let _else_val = parse_if_body(tokens, pos, scope)?;
    } else if cond != 0 {
        // No else — then-body was already evaluated above (side effects applied)
    }

    Ok(Some(()))
}

/// Generic helper to parse a list of statements until an optional terminator token.
fn parse_statement_list(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
    terminator: Option<&'static str>,
) -> Result<i64, ParseError> {
    let mut result = 0i64;

    while *pos < tokens.len() && terminator.map_or(true, |t| tokens[*pos] != t) {
        if parse_let_statement(tokens, pos, scope)? == Some(()) {
            continue;
        }
        // Handle bare assignment statement: x = expr ;
        let is_assignment = *pos < tokens.len()
            && scope.contains_key(tokens[*pos].as_str())
            && *pos + 1 < tokens.len()
            && tokens[*pos + 1] == "=";
        if is_assignment {
            let var_name = tokens[*pos].clone();
            *pos += 1; // skip ident
            do_assignment(tokens, pos, scope, &var_name)?;
            consume_semicolon(pos, tokens);
            continue;
        }
        if parse_if_statement(tokens, pos, scope)? == Some(()) {
            continue;
        }
        if tokens[*pos] == ";" {
            *pos += 1;
        } else {
            result = parse_expression(tokens, pos, scope)?;
        }
    }

    Ok(result)
}

/// Perform the core assignment: skip "=", evaluate RHS expression, store in scope.
#[cfg_attr(coverage_nightly, coverage(off))] // defensive branches unreachable with current callers
fn do_assignment(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
    var_name: &str,
) -> Result<i64, ParseError> {
    *pos += 1; // skip "="
    let val = parse_expression(tokens, pos, scope)?;
    // Search all frames innermost-first for the variable (reassignment path)
    if let Some(frame) = scope.0.iter_mut().rev().find(|f| f.contains_key(var_name)) {
        if let Some(entry) = frame.get_mut(var_name) {
            // Reassignment — check mutability
            if !entry.1 {
                return Err(ParseError::ImmutableReassignment(var_name.to_string()));
            }
            entry.0 = val;
        } else {
            unreachable!("variable was found but get_mut returned None");
        }
    } else {
        // Variable not declared — callers should guard with contains_key,
        // but if we reach here treat it as unknown identifier
        return Err(ParseError::UnknownIdentifier(var_name.to_string()));
    }
    Ok(val)
}

/// Helper to optionally consume a trailing semicolon.
fn consume_semicolon(pos: &mut usize, tokens: &[String]) {
    if *pos < tokens.len() && tokens[*pos] == ";" {
        *pos += 1;
    }
}

/// Parse a `let [mut] x = expr ;` statement. Returns Some(()) if it consumed tokens, None otherwise.
fn parse_let_statement(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<Option<()>, ParseError> {
    if *pos >= tokens.len() || tokens[*pos] != "let" {
        return Ok(None);
    }
    *pos += 1; // skip "let"
    // Skip optional "mut" keyword
    let is_mut = *pos < tokens.len() && tokens[*pos] == "mut";
    if is_mut {
        *pos += 1;
    }
    if *pos >= tokens.len() {
        return Err(ParseError::MissingVariableName);
    }
    let var_name = tokens[*pos].clone();
    *pos += 1;
    if *pos >= tokens.len() || tokens[*pos] != "=" {
        return Err(ParseError::MissingEqualsSign);
    }
    // Evaluate RHS
    *pos += 1; // skip "="
    let val = parse_expression(tokens, pos, scope)?;
    // Insert directly into current (innermost) frame — shadows outer bindings
    if let Some(frame) = scope.0.last_mut() {
        frame.insert(var_name.clone(), (val, is_mut));
    }
    consume_semicolon(pos, tokens);
    Ok(Some(()))
}

fn parse_expression(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<i64, ParseError> {
    let mut left = parse_and(tokens, pos, scope)?;

    while *pos < tokens.len() && tokens[*pos] == "||" {
        *pos += 1;
        let right = parse_and(tokens, pos, scope)?;
        // Logical OR: result is 1 if either operand is non-zero, else 0
        left = if left != 0 || right != 0 { 1 } else { 0 };
    }

    Ok(left)
}

fn parse_comparison(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<i64, ParseError> {
    let mut left = parse_additive(tokens, pos, scope)?;

    while *pos < tokens.len() && matches!(tokens[*pos].as_str(), "<" | ">" | "<=" | ">=") {
        let op = tokens[*pos].clone();
        *pos += 1;
        let right = parse_additive(tokens, pos, scope)?;
        left = if (op == "<" && left < right)
            || (op == ">" && left > right)
            || (op == "<=" && left <= right)
            || (op == ">=" && left >= right)
        {
            1
        } else {
            0
        };
    }

    Ok(left)
}

fn parse_and(tokens: &[String], pos: &mut usize, scope: &mut Scope) -> Result<i64, ParseError> {
    let mut left = parse_comparison(tokens, pos, scope)?;

    while *pos < tokens.len() && tokens[*pos] == "&&" {
        *pos += 1;
        let right = parse_comparison(tokens, pos, scope)?;
        // Logical AND: result is 1 if both operands are non-zero, else 0
        left = if left != 0 && right != 0 { 1 } else { 0 };
    }

    Ok(left)
}

fn parse_additive(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<i64, ParseError> {
    let mut left = parse_term(tokens, pos, scope)?;

    while *pos < tokens.len() && (tokens[*pos] == "+" || tokens[*pos] == "-") {
        let op = tokens[*pos].clone();
        *pos += 1;
        let right = parse_term(tokens, pos, scope)?;
        left = if op == "+" {
            left + right
        } else {
            left - right
        };
    }

    Ok(left)
}

fn parse_term(tokens: &[String], pos: &mut usize, scope: &mut Scope) -> Result<i64, ParseError> {
    let mut left = parse_factor(tokens, pos, scope)?;

    while *pos < tokens.len() && (tokens[*pos] == "*" || tokens[*pos] == "/" || tokens[*pos] == "%")
    {
        let op = tokens[*pos].clone();
        *pos += 1;
        let right = parse_factor(tokens, pos, scope)?;
        left = if op == "*" {
            left * right
        } else if op == "/" {
            left / right
        } else {
            left % right
        };
    }

    Ok(left)
}

fn parse_factor(tokens: &[String], pos: &mut usize, scope: &mut Scope) -> Result<i64, ParseError> {
    if *pos >= tokens.len() {
        return Err(ParseError::UnexpectedEndOfInput);
    }

    let token = &tokens[*pos];

    match token.as_str() {
        "(" => {
            *pos += 1;
            let val = parse_expression(tokens, pos, scope)?;
            if *pos < tokens.len() && tokens[*pos] == ")" {
                *pos += 1;
            }
            Ok(val)
        }
        "{" => {
            *pos += 1;
            let val = parse_block(tokens, pos, scope)?;
            if *pos < tokens.len() && tokens[*pos] == "}" {
                *pos += 1;
            }
            Ok(val)
        }
        "true" => {
            *pos += 1;
            Ok(1)
        }
        "false" => {
            *pos += 1;
            Ok(0)
        }
        "if" => {
            // if (condition) expr else expr
            *pos += 1; // skip "if"
            let cond = parse_if_condition(tokens, pos, scope)?;
            let then_val = parse_expression(tokens, pos, scope)?;
            if *pos < tokens.len() && tokens[*pos] == "else" {
                *pos += 1; // skip "else"
            }
            let else_val = parse_expression(tokens, pos, scope)?;
            Ok(if cond != 0 { then_val } else { else_val })
        }
        _ => {
            if let Ok(n) = token.parse::<i64>() {
                *pos += 1;
                Ok(n)
            } else if scope.contains_key(token.as_str())
                && (*pos + 1 >= tokens.len() || tokens[*pos + 1] != "=")
            {
                // Variable reference (not an assignment)
                let val = scope.get(token.as_str()).map(|e| e.0).unwrap_or(0);
                *pos += 1;
                Ok(val)
            } else if scope.contains_key(token.as_str())
                && (*pos + 1 < tokens.len())
                && tokens[*pos + 1] == "="
            {
                // Assignment expression: x = expr
                let var_name = token.clone();
                *pos += 1; // skip ident ("=" skipped by do_assignment)
                let val = do_assignment(tokens, pos, scope, &var_name)?;
                consume_semicolon(pos, tokens);
                Ok(val)
            } else {
                Err(ParseError::UnknownIdentifier(token.clone()))
            }
        }
    }
}

fn parse_block(tokens: &[String], pos: &mut usize, scope: &mut Scope) -> Result<i64, ParseError> {
    // Push a new local scope for the block
    scope.push();
    let result = parse_statement_list(tokens, pos, scope, Some("}"));
    // Pop the block scope when done
    scope.pop();
    result
}

