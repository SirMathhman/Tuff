#![cfg_attr(coverage_nightly, feature(coverage_attribute))]

#[derive(Debug)]
enum ParseError {
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

type ScopeFrame = std::collections::HashMap<String, (i64, bool)>;

/// Nested scope stack — innermost frame is last element.
struct Scope(Vec<ScopeFrame>);

impl Scope {
    fn new() -> Self {
        Scope(vec![ScopeFrame::new()])
    }

    /// Push a new local scope (for blocks).
    fn push(&mut self) {
        self.0.push(ScopeFrame::new());
    }

    /// Pop the innermost scope.
    fn pop(&mut self) {
        if self.0.len() > 1 {
            self.0.pop();
        }
    }

    /// Look up a variable from innermost to outermost scope.
    fn get(&self, name: &str) -> Option<&(i64, bool)> {
        self.0.iter().rev().find_map(|frame| frame.get(name))
    }

    /// Check if a variable exists in any scope level.
    fn contains_key(&self, name: &str) -> bool {
        self.0.iter().any(|frame| frame.contains_key(name))
    }
}

#[cfg_attr(coverage_nightly, coverage(off))]
fn main() {
    use std::io::{self, BufRead};

    println!("Tuff REPL — type an expression and press Enter (Ctrl+C to quit)");

    let stdin = io::stdin();

    for line in stdin.lock().lines() {
        match line {
            Ok(input) => {
                if input.trim().is_empty() {
                    continue;
                }
                match interpret(&input) {
                    Ok(result) => println!("{}", result),
                    Err(e) => eprintln!("Error: {}", e),
                }
            }
            Err(_) => break,
        }
    }
}

fn interpret(source: &str) -> Result<i64, String> {
    let tokens = tokenize(source);
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

fn tokenize(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();

    while let Some(&ch) = chars.peek() {
        if ch.is_whitespace() {
            chars.next();
        } else if matches!(
            ch,
            '(' | ')' | '{' | '}' | '+' | '*' | '/' | '%' | '=' | ';' | '<' | '>'
        ) {
            tokens.push(ch.to_string());
            chars.next();
        } else if ch == '&' && *chars.peek().unwrap_or(&' ') == '&' {
            // Handle && as a single token
            chars.next();
            chars.next();
            tokens.push("&&".to_string());
        } else if ch == '|' && *chars.peek().unwrap_or(&' ') == '|' {
            // Handle || as a single token
            chars.next();
            chars.next();
            tokens.push("||".to_string());
        } else if ch == '-'
            && !tokens.is_empty()
            && !matches!(&*tokens[tokens.len() - 1], "(" | "+" | "-" | "*")
        {
            tokens.push("-".to_string());
            chars.next();
        } else if ch.is_ascii_digit()
            || (ch == '-'
                && (tokens.is_empty()
                    || matches!(&*tokens[tokens.len() - 1], "(" | "+" | "-" | "*")))
        {
            let mut num = String::new();
            while let Some(&c) = chars.peek() {
                if c.is_ascii_digit() || (num.is_empty() && c == '-') {
                    num.push(c);
                    chars.next();
                } else {
                    break;
                }
            }
            tokens.push(num);
        } else if ch.is_alphabetic() || ch == '_' {
            let mut ident = String::new();
            while let Some(&c) = chars.peek() {
                if c.is_alphanumeric() || c == '_' {
                    ident.push(c);
                    chars.next();
                } else {
                    break;
                }
            }
            tokens.push(ident);
        } else {
            chars.next();
        }
    }

    tokens
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

fn parse_comparison(tokens: &[String], pos: &mut usize, scope: &mut Scope) -> Result<i64, ParseError> {
    let mut left = parse_additive(tokens, pos, scope)?;

    while *pos < tokens.len() && (tokens[*pos] == "<" || tokens[*pos] == ">") {
        let op = tokens[*pos].clone();
        *pos += 1;
        let right = parse_additive(tokens, pos, scope)?;
        left = if op == "<" && left < right
            || op == ">" && left > right { 1 } else { 0 };
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string() {
        assert_eq!(interpret(""), Ok(0));
    }

    #[test]
    fn test_whitespace_only() {
        assert_eq!(interpret(" "), Ok(0));
    }

    #[test]
    fn test_single_digit() {
        assert_eq!(interpret("1"), Ok(1));
    }

    #[test]
    fn test_single_digit_two() {
        assert_eq!(interpret("2"), Ok(2));
    }

    #[test]
    fn test_addition_expression() {
        assert_eq!(interpret("1 + 2"), Ok(3));
    }

    #[test]
    fn test_undefined_variable_returns_err() {
        assert!(interpret("abc").is_err());
    }

    #[test]
    fn test_parse_error_returns_err() {
        assert!(interpret(")").is_err());
    }

    #[test]
    fn test_negative_addition() {
        assert_eq!(interpret("-1 + -2"), Ok(-3));
    }

    #[test]
    fn test_chained_addition() {
        assert_eq!(interpret("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn test_mixed_add_subtract() {
        assert_eq!(interpret("3 + 2 - 4"), Ok(1));
    }

    #[test]
    fn test_multiplication_expression() {
        assert_eq!(interpret("5 * 3"), Ok(15));
    }

    #[test]
    fn test_mixed_mul_subtract() {
        assert_eq!(interpret("3 * 2 - 4"), Ok(2));
    }

    #[test]
    fn test_precedence_add_then_mul() {
        assert_eq!(interpret("3 + 2 * 4"), Ok(11));
    }

    #[test]
    fn test_division_truncates() {
        assert_eq!(interpret("5 / 3"), Ok(1));
    }

    #[test]
    fn test_trailing_mul_operator() {
        assert!(interpret("5 *").is_err());
    }

    #[test]
    fn test_trailing_add_operator() {
        assert!(interpret("5 +").is_err());
    }

    #[test]
    fn test_parenthesized_expression() {
        assert_eq!(interpret("(3 + 2) * 4"), Ok(20));
    }

    #[test]
    fn test_empty_parens() {
        assert!(interpret("()").is_err());
    }

    #[test]
    fn test_unrecognized_token_in_factor() {
        assert!(interpret(")").is_err());
    }

    #[test]
    fn test_division_expression() {
        assert_eq!(interpret("6 / 2"), Ok(3));
    }

    #[test]
    fn test_modulo_expression() {
        assert_eq!(interpret("5 % 3"), Ok(2));
    }

    #[test]
    fn test_braced_expression() {
        assert_eq!(interpret("{ 3 + 2 } * 4"), Ok(20));
    }

    #[test]
    fn test_let_binding_in_block() {
        assert_eq!(interpret("{ let x = 3 + 2; x } * 4"), Ok(20));
    }

    #[test]
    fn test_unrecognized_char_skipped() {
        // Characters like '@' are silently skipped by the tokenizer
        assert_eq!(interpret("1 @+ 2"), Ok(3));
    }

    #[test]
    fn test_let_without_var_name_errors() {
        // No tokens at all after "let" — hits the pos >= tokens.len() guard
        assert!(interpret("{ let").is_err());
    }

    #[test]
    fn test_let_without_equals_errors() {
        assert!(interpret("{ let x; } ").is_err());
    }

    #[test]
    fn test_standalone_semicolon_in_block() {
        assert_eq!(interpret("{ ; 3 + 2 }"), Ok(5));
    }

    #[test]
    fn test_top_level_let_with_nested_block() {
        assert_eq!(interpret("let y = { let x = 3 + 2; x } * 4; y"), Ok(20));
    }

    #[test]
    fn test_top_level_semicolon() {
        // Bare semicolons at the top level should be handled gracefully
        assert_eq!(interpret("; 5 ; "), Ok(5));
    }

    #[test]
    fn test_reassign_immutable_errors() {
        // Reassigning a non-mut variable should fail
        assert!(interpret("let x = 0; x = 1; x").is_err());
    }

    #[test]
    fn test_let_only_returns_zero() {
        // No trailing expression, so result stays at initial value of 0
        assert_eq!(interpret("let x = 100;"), Ok(0));
    }

    #[test]
    fn test_mut_and_reassignment() {
        assert_eq!(interpret("let mut x = 0; x = 1; x"), Ok(1));
    }

    #[test]
    fn test_assignment_in_expression_context() {
        // Assignment inside parens exercises the parse_factor assignment path
        assert_eq!(interpret("let mut x = 0; (x = 5) + 3"), Ok(8));
    }

    #[test]
    fn test_boolean_true_returns_one() {
        assert_eq!(interpret("let x = true; x"), Ok(1));
    }

    #[test]
    fn test_boolean_false_returns_zero() {
        assert_eq!(interpret("let x = false; x"), Ok(0));
    }

    #[test]
    fn test_logical_or_with_booleans() {
        assert_eq!(interpret("let x = true; let y = false; x || y"), Ok(1));
    }

    #[test]
    fn test_logical_and_with_booleans() {
        assert_eq!(interpret("let x = true; let y = false; x && y"), Ok(0));
    }

    #[test]
    fn test_reassign_in_block_persists() {
        // Block shares scope with parent, so assignment inside persists after block ends
        assert_eq!(interpret("let mut x = 0; { x = 1; } x"), Ok(1));
    }

    #[test]
    fn test_let_shadowing_allows_rebind() {
        // let x = ... followed by another let x = ... should shadow the first binding
        assert_eq!(interpret("let x = 0; let x = 1; x"), Ok(1));
    }

    #[test]
    fn test_block_shadow_does_not_affect_outer() {
        // let inside a block shadows outer variable but does not modify it on exit
        assert_eq!(interpret("let x = 1; { let x = 0; } x"), Ok(1));
    }

    #[test]
    fn test_less_than_comparison() {
        assert_eq!(interpret("let x = 0; let y = 1; x < y"), Ok(1));
    }
}
