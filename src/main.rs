use std::collections::{HashMap, HashSet};
use std::io::{self, Write};

struct Func {
    body_start: usize,
}

fn main() {
    println!("Tuff REPL. Type 'quit' to exit.");
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    loop {
        print!("> ");
        stdout.flush().unwrap();

        let mut input = String::new();
        stdin.read_line(&mut input).unwrap();
        let input = input.trim();

        if input == "quit" {
            break;
        }

        let result = interpret(input);
        println!("{}", result);
    }
}

fn interpret(source_code: &str) -> i32 {
    let tokens = tokenize(source_code);
    if tokens.is_empty() {
        return 0;
    }
    let mut ctx = Context {
        tokens,
        pos: 0,
        scopes: vec![HashMap::new()],
        mutable: HashSet::new(),
        functions: HashMap::new(),
    };
    let mut last_value = 0;
    while let Some(tok) = peek(&ctx) {
        if tok == "let" {
            last_value = parse_let_stmt(&mut ctx);
        } else {
            last_value = parse_expr(&mut ctx);
        }
        // Consume optional semicolon
        if let Some(tok) = peek(&ctx) && tok == ";" {
            consume(&mut ctx);
        }
    }
    last_value
}

fn tokenize(source: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = source.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        match ch {
            '(' | ')' | '{' | '}' | ';' | ':' => {
                if !current.is_empty() {
                    tokens.push(current.clone());
                    current.clear();
                }
                tokens.push(ch.to_string());
            }
            '=' => {
                if !current.is_empty() {
                    tokens.push(current.clone());
                    current.clear();
                }
                if i + 1 < chars.len() && chars[i + 1] == '>' {
                    tokens.push("=>".to_string());
                    i += 1;
                } else {
                    tokens.push(ch.to_string());
                }
            }
            '+' => {
                if !current.is_empty() {
                    tokens.push(current.clone());
                    current.clear();
                }
                if i + 1 < chars.len() && chars[i + 1] == '=' {
                    tokens.push("+=".to_string());
                    i += 1;
                } else {
                    tokens.push(ch.to_string());
                }
            }
            ' ' | '\t' => {
                if !current.is_empty() {
                    tokens.push(current.clone());
                    current.clear();
                }
            }
            _ => current.push(ch),
        }
        i += 1;
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

struct Context {
    tokens: Vec<String>,
    pos: usize,
    scopes: Vec<HashMap<String, i32>>,
    mutable: HashSet<String>,
    functions: HashMap<String, Func>,
}

fn lookup(ctx: &Context, name: &str) -> Option<i32> {
    for scope in ctx.scopes.iter().rev() {
        if let Some(&val) = scope.get(name) {
            return Some(val);
        }
    }
    None
}

fn insert_scope(ctx: &mut Context, name: String, value: i32) {
    if let Some(scope) = ctx.scopes.last_mut() {
        scope.insert(name, value);
    }
}

fn assign(ctx: &mut Context, name: &str, value: i32) {
    for scope in ctx.scopes.iter_mut().rev() {
        if scope.contains_key(name) {
            scope.insert(name.to_string(), value);
            return;
        }
    }
}

fn peek(ctx: &Context) -> Option<&String> {
    ctx.tokens.get(ctx.pos)
}

fn consume(ctx: &mut Context) -> String {
    let token = ctx.tokens[ctx.pos].clone();
    ctx.pos += 1;
    token
}

fn parse_expr(ctx: &mut Context) -> i32 {
    let mut result = parse_comparison(ctx);
    loop {
        let op = peek(ctx).cloned();
        match op.as_deref() {
            Some("+") | Some("-") => {
                consume(ctx);
                let right = parse_comparison(ctx);
                match op.as_deref().unwrap() {
                    "+" => result += right,
                    "-" => result -= right,
                    _ => unreachable!(),
                }
            }
            _ => break,
        }
    }
    result
}

fn parse_comparison(ctx: &mut Context) -> i32 {
    let mut result = parse_term(ctx);
    loop {
        let op = peek(ctx).cloned();
        match op.as_deref() {
            Some("<") | Some(">") | Some("<=") | Some(">=") | Some("==") | Some("!=") => {
                consume(ctx);
                let right = parse_term(ctx);
                result = match op.as_deref().unwrap() {
                    "<" => (result < right) as i32,
                    ">" => (result > right) as i32,
                    "<=" => (result <= right) as i32,
                    ">=" => (result >= right) as i32,
                    "==" => (result == right) as i32,
                    "!=" => (result != right) as i32,
                    _ => unreachable!(),
                };
            }
            _ => break,
        }
    }
    result
}

fn parse_term(ctx: &mut Context) -> i32 {
    let mut result = parse_factor(ctx);
    loop {
        let op = peek(ctx).cloned();
        match op.as_deref() {
            Some("*") | Some("/") => {
                consume(ctx);
                let right = parse_factor(ctx);
                match op.as_deref().unwrap() {
                    "*" => result *= right,
                    "/" => result /= right,
                    _ => unreachable!(),
                }
            }
            _ => break,
        }
    }
    result
}

fn parse_factor(ctx: &mut Context) -> i32 {
    let token = consume(ctx);
    match token.as_str() {
        "(" => {
            let result = parse_expr(ctx);
            if let Some(close) = peek(ctx) && close == ")" {
                consume(ctx);
            }
            result
        }
        "{" => {
            parse_block(ctx)
        }
        "if" => {
            parse_if_expr(ctx)
        }
        "while" => {
            parse_while_expr(ctx)
        }
        "fn" => {
            parse_fn_def(ctx)
        }
        "let" => {
            // Reuse parse_let_stmt which handles 'mut' keyword
            // We already consumed "let", so temporarily adjust
            let saved_pos = ctx.pos - 1; // Back up to "let"
            ctx.pos = saved_pos;
            parse_let_stmt(ctx)
        }
        _ => {
            // Try as boolean literal, then number, then function call, then variable/assignment
            match token.as_str() {
                "true" => 1,
                "false" => 0,
                _ => {
                    if let Some(suffix) = token.strip_suffix("U8") {
                        if let Ok(n) = suffix.parse::<i32>() {
                            n
                        } else if is_assignment(ctx, &token) {
                            parse_assignment(ctx, token)
                        } else {
                            lookup(ctx, &token).unwrap_or(0)
                        }
                    } else if let Ok(n) = token.parse::<i32>() {
                        n
                    } else if is_function_call(ctx) {
                        parse_function_call(ctx, token)
                    } else if is_assignment(ctx, &token) {
                        parse_assignment(ctx, token)
                    } else {
                        lookup(ctx, &token).unwrap_or(0)
                    }
                }
            }
        }
    }
}

fn parse_block(ctx: &mut Context) -> i32 {
    ctx.scopes.push(HashMap::new());
    let saved_mutable = ctx.mutable.clone();
    let mut last_value = 0;
    loop {
        let token = peek(ctx).cloned();
        match token.as_deref() {
            Some("}") => {
                consume(ctx);
                break;
            }
            Some("let") => {
                let _ = parse_let_stmt(ctx);
            }
            Some(_) => {
                last_value = parse_expr(ctx);
            }
            None => break,
        }
        if let Some(tok) = peek(ctx) && tok == ";" {
            consume(ctx);
        }
    }
    ctx.scopes.pop();
    ctx.mutable = saved_mutable;
    last_value
}

fn parse_let_stmt(ctx: &mut Context) -> i32 {
    consume(ctx); // consume "let"
    // Check for 'mut' keyword BEFORE consuming the identifier
    let is_mutable = if let Some(next) = peek(ctx) {
        if next == "mut" {
            consume(ctx);
            true
        } else {
            false
        }
    } else {
        false
    };
    let identifier = consume(ctx); // variable name
    // Skip optional type annotation (: TYPE)
    if let Some(tok) = peek(ctx) && tok == ":" {
        consume(ctx); // consume ":"
        consume(ctx); // consume type name
    }
    if let Some(eq) = peek(ctx) && eq.as_str() == "=" {
        consume(ctx);
    }
    let value = parse_expr(ctx);
    insert_scope(ctx, identifier.clone(), value);
    if is_mutable {
        ctx.mutable.insert(identifier);
    }
    value
}

fn parse_if_expr(ctx: &mut Context) -> i32 {
    consume_optional(ctx, "(");
    let condition = parse_expr(ctx);
    consume_optional(ctx, ")");
    let then_value = parse_expr(ctx);
    consume_optional(ctx, "else");
    let else_value = parse_expr(ctx);
    if condition != 0 { then_value } else { else_value }
}

fn consume_optional(ctx: &mut Context, expected: &str) {
    if let Some(tok) = peek(ctx) && tok == expected {
        consume(ctx);
    }
}

fn skip_semicolon(ctx: &mut Context) {
    if let Some(tok) = peek(ctx) && tok == ";" {
        consume(ctx);
    }
}

fn find_matching_paren(ctx: &Context, start: usize) -> usize {
    let mut depth = 0;
    let mut pos = start;
    while let Some(tok) = ctx.tokens.get(pos) {
        if tok == "(" { depth += 1; }
        if tok == ")" {
            if depth == 0 { break; }
            depth -= 1;
        }
        pos += 1;
    }
    pos
}

fn find_body_end(ctx: &Context, start: usize) -> usize {
    let mut pos = start;
    while let Some(tok) = ctx.tokens.get(pos) {
        if tok == ";" || tok == "}" { break; }
        pos += 1;
    }
    pos
}

fn parse_while_expr(ctx: &mut Context) -> i32 {
    consume_optional(ctx, "(");
    let cond_start = ctx.pos;
    let cond_end = find_matching_paren(ctx, ctx.pos);
    let body_start = cond_end + 1;
    let body_end = find_body_end(ctx, body_start);
    let mut last_value = 0;
    loop {
        ctx.pos = cond_start;
        let condition = parse_expr(ctx);
        consume_optional(ctx, ")");
        if condition == 0 {
            break;
        }
        ctx.pos = body_start;
        last_value = parse_expr(ctx);
        skip_semicolon(ctx);
    }
    ctx.pos = body_end;
    last_value
}

fn is_assignment(ctx: &Context, token: &str) -> bool {
    // Check if next token is "=" or "+=" and current token is not a number
    token.parse::<i32>().is_err() && matches!(peek(ctx).map(|s| s.as_str()), Some("=") | Some("+="))
}

fn parse_assignment(ctx: &mut Context, identifier: String) -> i32 {
    let op = consume(ctx); // consume "=" or "+="
    let value = parse_expr(ctx);
    if ctx.mutable.contains(&identifier) {
        let new_value = if op == "+=" {
            lookup(ctx, &identifier).unwrap_or(0) + value
        } else {
            value
        };
        assign(ctx, &identifier, new_value);
        new_value
    } else {
        value
    }
}

fn is_function_call(ctx: &Context) -> bool {
    peek(ctx).map(|s| s.as_str()) == Some("(")
}

fn parse_function_call(ctx: &mut Context, name: String) -> i32 {
    consume(ctx); // consume "("
    consume_optional(ctx, ")");
    if let Some(func) = ctx.functions.get(&name) {
        let saved_pos = ctx.pos;
        ctx.pos = func.body_start;
        let result = parse_expr(ctx);
        ctx.pos = saved_pos;
        result
    } else {
        0
    }
}

fn parse_fn_def(ctx: &mut Context) -> i32 {
    let name = consume(ctx); // function name
    consume_optional(ctx, "(");
    consume_optional(ctx, ")");
    consume_optional(ctx, "=>");
    let body_start = ctx.pos;
    let value = parse_expr(ctx);
    ctx.functions.insert(name, Func { body_start });
    value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_input() {
        assert_eq!(interpret(""), 0);
    }

    #[test]
    fn test_whitespace_input() {
        assert_eq!(interpret(" "), 0);
    }

    #[test]
    fn test_numeric_input() {
        assert_eq!(interpret("1"), 1);
    }

    #[test]
    fn test_addition() {
        assert_eq!(interpret("1 + 2"), 3);
    }

    #[test]
    fn test_chained_addition() {
        assert_eq!(interpret("1 + 2 + 3"), 6);
    }

    #[test]
    fn test_operator_precedence() {
        assert_eq!(interpret("1 + 2 * 3"), 7);
    }

    #[test]
    fn test_parentheses() {
        assert_eq!(interpret("(1 + 2) * 3"), 9);
    }

    #[test]
    fn test_braces() {
        assert_eq!(interpret("{ 1 + 2 } * 3"), 9);
    }

    #[test]
    fn test_block_with_let() {
        assert_eq!(interpret("let y = { let x = 1 + 2; x } * 3; y"), 9);
    }

    #[test]
    fn test_mutable_assignment() {
        assert_eq!(interpret("let mut x = 0; x = 1; x"), 1);
    }

    #[test]
    fn test_mutable_assignment_in_block() {
        assert_eq!(interpret("let mut x = 0; { x = 1; } x"), 1);
    }

    #[test]
    fn test_variable_redeclaration() {
        assert_eq!(interpret("let x = 0; let x = 1; x"), 1);
    }

    #[test]
    fn test_block_scope_shadowing() {
        assert_eq!(interpret("let x = 1; { let x = 0; } x"), 1);
    }

    #[test]
    fn test_boolean_literal() {
        assert_eq!(interpret("let x = true; x"), 1);
    }

    #[test]
    fn test_less_than() {
        assert_eq!(interpret("let x = 0; let y = 1; x < y"), 1);
    }

    #[test]
    fn test_if_expression() {
        assert_eq!(interpret("let x = if (true) 3 else 5; x"), 3);
    }

    #[test]
    fn test_if_else_if_expression() {
        assert_eq!(interpret("let x = if (false) 1 else if (false) 2 else 3; x"), 3);
    }

    #[test]
    fn test_if_else_if_with_assignment() {
        assert_eq!(interpret("let mut x = 0; if (false) x = 1; else if (false) x = 2; else x = 3; x"), 3);
    }

    #[test]
    fn test_if_else_if_with_block_assignment() {
        assert_eq!(interpret("let mut x = 0; if (false) { x = 1; } else if (false) { x = 2; } else { x = 3; } x"), 3);
    }

    #[test]
    fn test_add_assign() {
        assert_eq!(interpret("let mut x = 0; x += 1; x"), 1);
    }

    #[test]
    fn test_while_loop() {
        assert_eq!(interpret("let mut x = 0; while (x < 4) x += 1; x"), 4);
    }

    #[test]
    fn test_type_annotation_and_suffixed_literal() {
        assert_eq!(interpret("let x : U8 = 100U8; x"), 100);
    }

    #[test]
    fn test_function_definition_and_call() {
        assert_eq!(interpret("fn get() => 100; get()"), 100);
    }
}