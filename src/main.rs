use std::collections::HashMap;
use std::io::{self, BufRead, Write};

// --- Simple recursive-descent parser ---
// Program   -> Statement* Expr
// Block     -> '{' Statement* Expr '}'
// Statement -> 'let' ['mut'] IDENT '=' Expr ';'
//            | IDENT ('+'|'-'|'*'|'/')? '=' Expr ';'
//            | 'while' CONDITION body
//            | 'if' CONDITION body ['else' body]
// Expr   -> Term (('+' | '-') Term)*
// Term   -> Factor (('*' | '/') Factor)*
// Factor -> '(' Expr ')' | Block | Identifier | Number
// Identifier -> letter+digit*
// Number -> digit+

/// Scoped environment: innermost scope is the last entry.
#[derive(Default)]
struct Env {
    /// Each entry stores (value, is_mutable).
    scopes: Vec<HashMap<String, (i64, bool)>>,
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
            .find_map(|scope| scope.get(name).map(|(v, _)| *v))
    }

    /// Insert into the current (innermost) scope.
    fn insert(&mut self, name: String, val: i64, mutable: bool) {
        if let Some(scope) = self.scopes.last_mut() {
            scope.insert(name, (val, mutable));
        }
    }

    /// Update a variable in any scope (for assignment).
    fn update(&mut self, name: &str, val: i64) -> Result<(), String> {
        for scope in self.scopes.iter_mut().rev() {
            if let Some((v, mutable)) = scope.get_mut(name) {
                if !*mutable {
                    return Err(format!("cannot assign to immutable variable: {}", name));
                }
                *v = val;
                return Ok(());
            }
        }
        Err(format!("undefined variable: {}", name))
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

/// Logical OR layer (lowest precedence): Expr ('||' Expr)*
fn parse_logical_or(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    let mut result = parse_logical_and(input, env)?;
    loop {
        skip_spaces(input);
        if input.starts_with(b"||") {
            *input = &input[2..]; // consume '||'
            skip_spaces(input);
            let rhs = parse_logical_and(input, env)?;
            result = if result != 0 || rhs != 0 { 1 } else { 0 };
        } else {
            break;
        }
    }
    Ok(result)
}

/// Logical AND layer: Comparison ('&&' Comparison)*
fn parse_logical_and(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    let mut result = parse_comparison(input, env)?;
    loop {
        skip_spaces(input);
        if input.starts_with(b"&&") {
            *input = &input[2..]; // consume '&&'
            skip_spaces(input);
            let rhs = parse_comparison(input, env)?;
            result = if result != 0 && rhs != 0 { 1 } else { 0 };
        } else {
            break;
        }
    }
    Ok(result)
}

/// Comparison layer: Expr (('<'|'>'|'<='|'>='|'=='|'!=') Expr)*
fn parse_comparison(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    let mut result = parse_expr(input, env)?;
    loop {
        skip_spaces(input);
        if input.starts_with(b"<=")
            || input.starts_with(b">=")
            || input.starts_with(b"==")
            || input.starts_with(b"!=")
        {
            let op = (input[0] as char, input[1] as char);
            *input = &input[2..]; // consume operator
            skip_spaces(input);
            let rhs = parse_comparison(input, env)?;
            result = match op {
                ('<', '=') => {
                    if result <= rhs {
                        1
                    } else {
                        0
                    }
                }
                ('>', '=') => {
                    if result >= rhs {
                        1
                    } else {
                        0
                    }
                }
                ('=', '=') => {
                    if result == rhs {
                        1
                    } else {
                        0
                    }
                }
                ('!', '=') => {
                    if result != rhs {
                        1
                    } else {
                        0
                    }
                }
                _ => unreachable!(),
            };
        } else if input.first().copied() == Some(b'<') || input.first().copied() == Some(b'>') {
            let op = input[0];
            *input = &input[1..]; // consume operator
            skip_spaces(input);
            let rhs = parse_comparison(input, env)?;
            result = match op {
                b'<' => {
                    if result < rhs {
                        1
                    } else {
                        0
                    }
                }
                b'>' => {
                    if result > rhs {
                        1
                    } else {
                        0
                    }
                }
                _ => unreachable!(),
            };
        } else {
            break;
        }
    }
    Ok(result)
}

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
        let val = parse_comparison(input, env)?;
        skip_spaces(input);
        if input.first().copied() != Some(b')') {
            return Err("expected ')'".to_string());
        }
        *input = &input[1..]; // consume ')'
        Ok(val)
    } else if input.first().copied() == Some(b'{') {
        parse_block(input, env)
    } else if input.starts_with(b"if") && (input.len() < 3 || !input[2].is_ascii_alphanumeric()) {
        // Parse if/else expression: 'if' CONDITION CONSEQUENCE 'else' ALTERNATIVE
        *input = &input[2..]; // consume "if"
        skip_spaces(input);
        let cond = parse_logical_or(input, env)?;
        skip_spaces(input);
        let consequence = parse_logical_or(input, env)?;
        skip_spaces(input);
        if !input.starts_with(b"else") {
            return Err("expected 'else' in if expression".to_string());
        }
        *input = &input[4..]; // consume "else"
        skip_spaces(input);
        let alternative = parse_logical_or(input, env)?;
        Ok(if cond != 0 { consequence } else { alternative })
    } else if input.first().map_or(false, |&c| c.is_ascii_alphabetic()) {
        let ident = read_ident(input);
        // Check for boolean literals first
        match ident.as_str() {
            "true" => Ok(1),
            "false" => Ok(0),
            _ => match env.get(&ident) {
                Some(val) => Ok(val),
                None => Err(format!("undefined variable: {}", ident)),
            },
        }
    } else {
        parse_number(input)
    }
}

/// Parse a block: '{' Statement* Expr '}'
fn parse_block(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    *input = &input[1..]; // consume '{'
    env.enter_scope();
    let last_val = parse_statements_loop(input, env, true)?;
    env.exit_scope();
    *input = &input[1..]; // consume '}'
    Ok(last_val)
}

/// Check if the current input starts with a given keyword.
fn starts_with_keyword(input: &[u8], keyword: &[u8]) -> bool {
    let mut i = 0;
    while i < input.len() && (input[i] == b' ' || input[i] == b'\t') {
        i += 1;
    }
    if i + keyword.len() > input.len() {
        return false;
    }
    let kw = &input[i..i + keyword.len()];
    kw == keyword
        && (i + keyword.len() >= input.len() || !input[i + keyword.len()].is_ascii_alphanumeric())
}

fn is_let_statement(input: &[u8]) -> bool {
    starts_with_keyword(input, b"let")
}
fn is_if_statement(input: &[u8]) -> bool {
    starts_with_keyword(input, b"if")
}
fn is_while_statement(input: &[u8]) -> bool {
    starts_with_keyword(input, b"while")
}

/// Skip over a block without executing it (for non-taken if/else branches).
fn skip_block(input: &mut &[u8]) -> Result<(), String> {
    *input = &input[1..]; // consume '{'
    let mut depth = 1;
    while !input.is_empty() && depth > 0 {
        match input.first().copied() {
            Some(b'{') => depth += 1,
            Some(b'}') => depth -= 1,
            _ => {}
        }
        *input = &input[1..];
    }
    if depth != 0 {
        return Err("unmatched '{' in block".to_string());
    }
    Ok(())
}

/// Parse a single body item (let/assignment/expression-stmt or block).
fn parse_body_item(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    if is_let_statement(input) {
        parse_let_statement(input, env)
    } else if is_assignment_statement(input) {
        parse_assignment(input, env)
    } else if is_if_statement(input) {
        parse_if_statement(input, env)
    } else {
        let val = parse_logical_or(input, env)?;
        skip_spaces(input);
        if input.first().copied() == Some(b';') {
            *input = &input[1..]; // consume ';'
        }
        Ok(val)
    }
}

/// Skip a single body item without executing it.
fn skip_body_item(input: &mut &[u8]) -> Result<(), String> {
    if input.first().copied() == Some(b'{') {
        skip_block(input)?;
    } else {
        // Consume until we hit ';' or 'else' at the top level
        let mut depth = 0usize;
        while !input.is_empty()
            && !(depth == 0 && input.first().copied() == Some(b';'))
            && !(depth == 0 && input.starts_with(b"else"))
        {
            if input.first().copied() == Some(b'{') {
                depth += 1;
            } else if input.first().copied() == Some(b'}') {
                depth -= 1;
            }
            *input = &input[1..];
        }
        // Consume the ';' if present (but not 'else')
        skip_spaces(input);
        if input.first().copied() == Some(b';') {
            *input = &input[1..];
        }
    }
    Ok(())
}

/// Parse an if/else statement: 'if' CONDITION body ['else' body]
fn parse_if_statement(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    skip_spaces(input);
    *input = &input[2..]; // consume "if"
    skip_spaces(input);
    let cond = parse_logical_or(input, env)?;
    skip_spaces(input);

    if cond != 0 {
        let val = parse_body_item(input, env)?;
        skip_spaces(input);
        if input.starts_with(b"else") {
            *input = &input[4..]; // consume "else"
            skip_spaces(input);
            skip_body_item(input)?; // discard non-taken branch
        }
        Ok(val)
    } else {
        let _ = parse_body_item(input, env);
        skip_spaces(input);
        if input.starts_with(b"else") {
            *input = &input[4..]; // consume "else"
            skip_spaces(input);
            parse_body_item(input, env)
        } else {
            Ok(0)
        }
    }
}

/// Check if the current input starts with an assignment statement: IDENT ('+'|'-'|'*'|'/')? '=' Expr ';'
fn is_assignment_statement(input: &[u8]) -> bool {
    let mut i = 0;
    while i < input.len() && (input[i] == b' ' || input[i] == b'\t') {
        i += 1;
    }
    if i >= input.len() || !input[i].is_ascii_alphabetic() {
        return false;
    }
    let mut j = i;
    while j < input.len() && (input[j].is_ascii_alphanumeric() || input[j] == b'_') {
        j += 1;
    }
    while j < input.len() && (input[j] == b' ' || input[j] == b'\t') {
        j += 1;
    }
    if j >= input.len() {
        return false;
    }
    // '=' or '+=' / '-=' / '*=' / '/='
    if input[j] == b'=' {
        return true;
    }
    if j + 1 < input.len() && input[j + 1] == b'=' {
        matches!(input[j], b'+' | b'-' | b'*' | b'/')
    } else {
        false
    }
}

/// Parse a `let` statement: 'let' ['mut'] IDENT '=' Expr ';'
fn parse_let_statement(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    skip_spaces(input);
    *input = &input[3..]; // consume "let"
    skip_spaces(input);
    let mutable = if input.starts_with(b"mut ") || (input.len() >= 3 && &input[..3] == b"mut") {
        *input = &input[3..];
        skip_spaces(input);
        true
    } else {
        false
    };
    let name = read_ident(input);
    skip_spaces(input);
    if input.first().copied() != Some(b'=') {
        return Err("expected '='".to_string());
    }
    *input = &input[1..]; // consume '='
    skip_spaces(input);
    let val = parse_comparison(input, env)?;
    expect_semicolon(input)?;
    env.insert(name, val, mutable);
    Ok(val)
}

/// Expect and consume a semicolon.
fn expect_semicolon(input: &mut &[u8]) -> Result<(), String> {
    skip_spaces(input);
    if input.first().copied() != Some(b';') {
        return Err("expected ';'".to_string());
    }
    *input = &input[1..]; // consume ';'
    Ok(())
}

/// Parse a while loop: 'while' CONDITION body
fn parse_while_statement(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    skip_spaces(input);
    *input = &input[5..]; // consume "while"
    skip_spaces(input);

    // Save the condition bytes so we can re-parse them each iteration.
    let cond_bytes = input.to_vec();

    loop {
        // Restore condition for re-parsing (environment state carries mutations)
        *input = unsafe { std::slice::from_raw_parts(cond_bytes.as_ptr(), cond_bytes.len()) };

        let cond = parse_logical_or(input, env)?;
        skip_spaces(input);

        if cond != 0 {
            // Execute body
            let _ = parse_body_item(input, env)?;
        } else {
            // Condition is false — skip past the body without executing it,
            // so that outer statement parsing doesn't re-execute those bytes.
            skip_body_item(input)?;
            break;
        }
    }

    Ok(0) // while loops don't produce a value themselves
}

/// Parse an assignment: IDENT ('+'|'-'|'*'|'/')? '=' Expr ';'
fn parse_assignment(input: &mut &[u8], env: &'_ mut Env) -> ParseResult {
    let name = read_ident(input);
    skip_spaces(input);

    // Check for compound assignment operators (+=, -= *=, /=) or plain (=)
    let op = if input.starts_with(b"+=")
        || input.starts_with(b"-=")
        || input.starts_with(b"*=")
        || input.starts_with(b"/=")
    {
        let char_op = input[0] as char; // capture the arithmetic op before consuming
        *input = &input[2..]; // consume operator
        Some(char_op)
    } else if input.first().copied() == Some(b'=') {
        *input = &input[1..]; // consume '='
        None
    } else {
        return Err("expected '='".to_string());
    };

    skip_spaces(input);
    let val = parse_logical_or(input, env)?;
    expect_semicolon(input)?;

    if let Some(op) = op {
        // Compound assignment: read current value, apply op, write back
        let current = env
            .get(&name)
            .ok_or_else(|| format!("undefined variable: {}", name))?;
        let new_val = match op {
            '+' => current + val,
            '-' => current - val,
            '*' => current * val,
            '/' => {
                if val == 0 {
                    return Err("division by zero".to_string());
                }
                current / val
            }
            _ => unreachable!(),
        };
        env.update(&name, new_val)?;
        Ok(new_val)
    } else {
        env.update(&name, val)?;
        Ok(val)
    }
}

/// Parse statements until we hit a terminator ('}' or EOF) and return the last value.
fn parse_statements_loop(input: &mut &[u8], env: &'_ mut Env, block_mode: bool) -> ParseResult {
    let mut last_val = 0i64;
    loop {
        skip_spaces(input);
        if block_mode && input.first().copied() == Some(b'}') {
            break;
        }
        if !block_mode && input.is_empty() {
            break;
        }
        if is_let_statement(input) {
            last_val = parse_let_statement(input, env)?;
        } else if is_if_statement(input) {
            last_val = parse_if_statement(input, env)?;
        } else if is_while_statement(input) {
            last_val = parse_while_statement(input, env)?;
        } else if is_assignment_statement(input) {
            last_val = parse_assignment(input, env)?;
        } else if block_mode {
            last_val = parse_logical_or(input, env)?;
        } else {
            break;
        }
    }
    Ok(last_val)
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
    let last_val = parse_statements_loop(input, env, false)?;
    skip_spaces(input);
    if input.is_empty() {
        return Ok(last_val);
    }
    let val = parse_logical_or(input, env)?;
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

    #[test]
    fn test_same_scope_reassignment() {
        // Redeclaring in the same scope should update the value.
        assert_eq!(execute_tuff("let x = 0; let x = 100; x"), Ok(100));
    }

    #[test]
    fn test_mutable_variable_assignment() {
        // `let mut` allows bare assignment (`x = ...`) to change the value.
        assert_eq!(execute_tuff("let mut x = 0; x = 1; x"), Ok(1));
    }

    #[test]
    fn test_immutable_variable_assignment_error() {
        // Assigning to a non-mutable variable should fail.
        assert!(execute_tuff("let x = 0; x = 1; x").is_err());
    }

    #[test]
    fn test_mutable_outer_scope_from_inner_block() {
        // Assignment inside inner block updates outer-scope mutable variable.
        assert_eq!(
            execute_tuff("let mut x = 0; let y = { x = 1; 0 }; x"),
            Ok(1)
        );
    }

    #[test]
    fn test_boolean_literal_true() {
        // `true` literal should evaluate to 1.
        assert_eq!(execute_tuff("let x = true; x"), Ok(1));
    }

    #[test]
    fn test_logical_or_expression() {
        // || operator with boolean variables.
        assert_eq!(execute_tuff("let x = true; let y = false; x || y"), Ok(1));
    }

    #[test]
    fn test_logical_and_expression() {
        // && operator: true && false => 0.
        assert_eq!(execute_tuff("let x = true; let y = false; x && y"), Ok(0));
    }

    #[test]
    fn test_comparison_less_than() {
        // < comparison: 0 < 1 => 1 (true).
        assert_eq!(execute_tuff("let x = 0; let y = 1; x < y"), Ok(1));
    }

    #[test]
    fn test_if_else_expression() {
        // if/else expression: conditionally assigns a value.
        assert_eq!(execute_tuff("let x = if (3 < 4) 2 else 5; x"), Ok(2));
    }

    #[test]
    fn test_if_with_variable_condition() {
        // Condition can be a variable holding the result of a comparison.
        assert_eq!(
            execute_tuff("let y = 3 < 4; let x = if (y) 2 else 5; x"),
            Ok(2)
        );
    }

    #[test]
    fn test_mutable_assignment_in_block_persists() {
        // Assignment to outer-scope mutable variable inside a block persists.
        assert_eq!(execute_tuff("let mut x = 0; { x = 2; } x"), Ok(2));
    }

    #[test]
    fn test_if_else_statement_with_blocks() {
        // if/else as statement with block bodies, conditionally assigning to mutable var.
        assert_eq!(
            execute_tuff("let mut x = 0; if (true) { x = 2; } else { x = 3; } x"),
            Ok(2)
        );
    }

    #[test]
    fn test_if_else_statement_bare_assignments() {
        // if/else as statement with bare assignment bodies (no blocks).
        assert_eq!(
            execute_tuff("let mut x = 0; if (true) x = 2; else x = 3; x"),
            Ok(2)
        );
    }

    #[test]
    fn test_compound_add_assignment() {
        // += operator: let mut x = 0; x += 1; => 1
        assert_eq!(execute_tuff("let mut x = 0; x += 1; x"), Ok(1));
    }

    #[test]
    fn test_compound_sub_assignment() {
        // -= operator: let mut x = 5; x -= 3; => 2
        assert_eq!(execute_tuff("let mut x = 5; x -= 3; x"), Ok(2));
    }

    #[test]
    fn test_compound_mul_assignment() {
        // *= operator: let mut x = 4; x *= 3; => 12
        assert_eq!(execute_tuff("let mut x = 4; x *= 3; x"), Ok(12));
    }

    #[test]
    fn test_compound_div_assignment() {
        // /= operator: let mut x = 10; x /= 2; => 5
        assert_eq!(execute_tuff("let mut x = 10; x /= 2; x"), Ok(5));
    }

    #[test]
    fn test_compound_assignment_with_expression() {
        // += with expression on RHS: let mut x = 1; x += 2 * 3; => 7
        assert_eq!(execute_tuff("let mut x = 1; x += 2 * 3; x"), Ok(7));
    }

    #[test]
    fn test_compound_assignment_immutable_error() {
        // Compound assignment on immutable variable should fail.
        assert!(execute_tuff("let x = 0; x += 1; x").is_err());
    }

    #[test]
    fn test_while_loop_basic() {
        // while loop: let mut x = 0; while (x < 4) x += 1; x => 4
        assert_eq!(
            execute_tuff("let mut x = 0; while (x < 4) x += 1; x"),
            Ok(4)
        );
    }

    #[test]
    fn test_while_loop_block_body() {
        // while loop with block body
        assert_eq!(
            execute_tuff("let mut x = 0; let mut y = 0; while (x < 3) { x += 1; y += 2; } y"),
            Ok(6)
        );
    }

    #[test]
    fn test_while_loop_false_condition() {
        // while loop that never executes because condition is false
        assert_eq!(
            execute_tuff("let mut x = 0; while (x > 5) x += 1; x"),
            Ok(0)
        );
    }

    #[test]
    fn test_nested_while_loop() {
        // nested while loops
        assert_eq!(
            execute_tuff(
                "let mut i = 0; let mut sum = 0; while (i < 3) { sum += i + 1; i += 1; } sum"
            ),
            Ok(6)
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
