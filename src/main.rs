use std::collections::HashMap;
use std::io::{self, BufRead, Write};

// --- Simple recursive-descent parser ---
// Program  -> Statement* Expr
// Block    -> '{' Statement* Expr '}'
// Statement -> 'let' IDENT '=' Expr ';'
// Expr   -> Term (('+' | '-') Term)*
// Term   -> Factor (('*' | '/') Factor)*
// Factor -> '(' Expr ')' | Block | Identifier | Number
// Identifier -> letter+digit*
// Number -> digit+

/// Scoped environment: innermost scope is the last entry.
#[derive(Default)]
struct Env {
    scopes: Vec<HashMap<String, i64>>,
}

impl Env {
    fn new() -> Self {
        Self {
            scopes: vec![HashMap::new()],
        }
    }

    /// Lookup a variable from innermost to outermost scope.
    fn get(&self, name: &str) -> Option<i64> {
        self.scopes
            .iter()
            .rev()
            .find_map(|scope| scope.get(name).copied())
    }

    /// Insert into the current (innermost) scope.
    fn insert(&mut self, name: String, val: i64) {
        if let Some(scope) = self.scopes.last_mut() {
            scope.insert(name, val);
        }
    }

    /// Enter a new scope.
    fn enter_scope(&mut self) {
        self.scopes.push(HashMap::new());
    }

    /// Exit the current scope.
    fn exit_scope(&mut self) {
        if self.scopes.len() > 1 {
            self.scopes.pop();
        }
    }
}

type ParseResult = Result<i64, String>;

fn parse_expr(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    let mut result = parse_term(input, env)?;
    loop {
        skip_spaces(input);
        match input.first().copied() {
            Some(b'+') | Some(b'-') => {}
            _ => break,
        }
        let op = input[0];
        *input = &input[1..]; // consume operator
        skip_spaces(input);
        let rhs = parse_term(input, env)?;
        match op {
            b'+' => result += rhs,
            b'-' => result -= rhs,
            _ => unreachable!(),
        }
    }
    Ok(result)
}

fn parse_term(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    let mut result = parse_factor(input, env)?;
    loop {
        skip_spaces(input);
        match input.first().copied() {
            Some(b'*') | Some(b'/') => {}
            _ => break,
        }
        let op = input[0];
        *input = &input[1..]; // consume operator
        skip_spaces(input);
        let rhs = parse_factor(input, env)?;
        match op {
            b'*' => result *= rhs,
            b'/' => {
                if rhs == 0 {
                    return Err("division by zero".to_string());
                }
                result /= rhs;
            }
            _ => unreachable!(),
        }
    }
    Ok(result)
}

fn parse_factor(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    skip_spaces(input);
    if input.first().copied() == Some(b'(') {
        *input = &input[1..]; // consume '('
        let val = parse_expr(input, env)?;
        skip_spaces(input);
        if input.first().copied() != Some(b')') {
            return Err("expected ')'".to_string());
        }
        *input = &input[1..]; // consume ')'
        Ok(val)
    } else if input.first().copied() == Some(b'{') {
        parse_block(input, env)
    } else if input.first().map_or(false, |&c| c.is_ascii_alphabetic()) {
        let ident = read_ident(input);
        match env.get(&ident) {
            Some(val) => Ok(val),
            None => Err(format!("undefined variable: {}", ident)),
        }
    } else {
        parse_number(input)
    }
}

/// Parse a block: '{' Statement* Expr '}'
fn parse_block(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    *input = &input[1..]; // consume '{'
    env.enter_scope();
    let mut last_val = 0i64;
    loop {
        skip_spaces(input);
        if input.first().copied() == Some(b'}') {
            break;
        }
        // Try parsing a statement (let ...) or fall back to an expression
        if is_let_statement(input) {
            last_val = parse_let_statement(input, env)?;
        } else {
            last_val = parse_expr(input, env)?;
        }
    }
    env.exit_scope();
    *input = &input[1..]; // consume '}'
    Ok(last_val)
}

/// Check if the current input starts with a `let` statement.
fn is_let_statement(input: &[u8]) -> bool {
    let mut i = 0;
    while i < input.len() && (input[i] == b' ' || input[i] == b'\t') {
        i += 1;
    }
    if i + 3 > input.len() {
        return false;
    }
    let kw = &input[i..i + 3];
    kw == b"let" && (i + 3 >= input.len() || !input[i + 3].is_ascii_alphanumeric())
}

/// Parse a `let` statement: 'let' IDENT '=' Expr ';'
fn parse_let_statement(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    skip_spaces(input);
    // consume "let"
    *input = &input[3..];
    skip_spaces(input);
    let name = read_ident(input);
    skip_spaces(input);
    if input.first().copied() != Some(b'=') {
        return Err("expected '='".to_string());
    }
    *input = &input[1..]; // consume '='
    skip_spaces(input);
    let val = parse_expr(input, env)?;
    skip_spaces(input);
    if input.first().copied() != Some(b';') {
        return Err("expected ';'".to_string());
    }
    *input = &input[1..]; // consume ';'
    env.insert(name, val);
    Ok(val)
}

/// Read an identifier (letter followed by alphanumeric chars).
fn read_ident(input: &mut &[u8]) -> String {
    let mut bytes = Vec::new();
    while input
        .first()
        .map_or(false, |&c| c.is_ascii_alphanumeric() || c == b'_')
    {
        bytes.push(input[0]);
        *input = &input[1..];
    }
    String::from_utf8(bytes).unwrap_or_default()
}

fn parse_number(input: &mut &[u8]) -> ParseResult {
    let mut chars = Vec::new();
    while input.first().map_or(false, |&c| c.is_ascii_digit()) {
        chars.push(input[0]);
        *input = &input[1..];
    }
    if chars.is_empty() {
        return Err("expected number".to_string());
    }
    let s: String = chars.into_iter().map(|b| b as char).collect();
    match s.parse::<i64>() {
        Ok(n) => Ok(n),
        Err(_) => Err(format!("invalid integer: {}", s)),
    }
}

fn skip_spaces(input: &mut &[u8]) {
    while input.first().copied() == Some(b' ') || input.first().copied() == Some(b'\t') {
        *input = &input[1..];
    }
}

/// Parse a program: zero or more statements followed by a final expression.
fn parse_program(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    let mut last_val = 0i64;
    loop {
        skip_spaces(input);
        if input.is_empty() {
            break;
        }
        // If we see a `let` keyword, parse it as a statement.
        // Otherwise fall through to the final expression (which consumes everything).
        if is_let_statement(input) {
            last_val = parse_let_statement(input, env)?;
        } else {
            break;
        }
    }
    skip_spaces(input);
    if input.is_empty() {
        return Ok(last_val);
    }
    let val = parse_expr(input, env)?;
    Ok(val)
}

fn execute_tuff(source: &str) -> Result<i64, String> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }
    let mut input: &[u8] = trimmed.as_bytes();
    let mut env = Env::new();
    parse_program(&mut input, &mut env)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string_returns_zero() {
        assert_eq!(execute_tuff(""), Ok(0));
    }

    #[test]
    fn test_whitespace_returns_zero() {
        assert_eq!(execute_tuff("   "), Ok(0));
        assert_eq!(execute_tuff("\t\n"), Ok(0));
    }

    #[test]
    fn test_numeric_literal() {
        assert_eq!(execute_tuff("100"), Ok(100));
    }

    #[test]
    fn test_addition_expression() {
        assert_eq!(execute_tuff("1 + 2"), Ok(3));
    }

    #[test]
    fn test_chained_addition() {
        assert_eq!(execute_tuff("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn test_mixed_add_subtract() {
        assert_eq!(execute_tuff("2 + 3 - 4"), Ok(1));
    }

    #[test]
    fn test_multiplication_precedence() {
        assert_eq!(execute_tuff("2 * 3 - 4"), Ok(2));
    }

    #[test]
    fn test_addition_with_higher_precedence_multiply() {
        assert_eq!(execute_tuff("2 + 3 * 4"), Ok(14));
    }

    #[test]
    fn test_parenthesized_expression() {
        assert_eq!(execute_tuff("(2 + 3) * 4"), Ok(20));
    }

    #[test]
    fn test_division_by_zero_error() {
        assert!(execute_tuff("1 / (1 - 1)").is_err());
    }

    #[test]
    fn test_curly_brace_block() {
        assert_eq!(execute_tuff("{ 2 + 3 } * 4"), Ok(20));
    }

    #[test]
    fn test_let_in_block() {
        assert_eq!(execute_tuff("{ let x = 2 + 3; x } * 4"), Ok(20));
    }

    #[test]
    fn test_top_level_let_with_nested_block() {
        assert_eq!(execute_tuff("let y = { let x = 2 + 3; x } * 4; y"), Ok(20));
    }

    #[test]
    fn test_scoped_variables_no_shadow_leak() {
        // Inner `x` should not overwrite outer `x` after block exits.
        assert_eq!(
            execute_tuff("let x = 100; let y = { let x = 0; x }; x"),
            Ok(100)
        );
    }
}

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();

    println!("Tuff REPL (type 'quit' to exit)");

    loop {
        write!(out, "> ").unwrap();
        out.flush().unwrap();

        let line = stdin.lock().lines().next().unwrap().unwrap();

        if line.trim() == "quit" {
            break;
        }

        if line.trim().is_empty() {
            continue;
        }

        match execute_tuff(&line) {
            Ok(result) => println!("= {}", result),
            Err(e) => println!("error: {}", e),
        }
    }
}
