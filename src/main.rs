/// Token types for the Tuff expression language
#[derive(Debug, Clone)]
enum Token {
    Number(i64),
    Ident(String),
    Plus,
    Minus,
    Multiply,
    Divide,
    LParen,
    RParen,
    LBrace,
    RBrace,
    KeywordLet,
    Eq,
    Semicolon,
    Eof,
}

/// Simple tokenizer that splits input into tokens.
fn tokenize(input: &str) -> Result<Vec<Token>, String> {
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();

    while let Some(&c) = chars.peek() {
        if c.is_whitespace() {
            chars.next();
        } else if c.is_ascii_digit() {
            let mut num_str = String::new();
            while let Some(&ch) = chars.peek() {
                if ch.is_ascii_digit() {
                    num_str.push(ch);
                    chars.next();
                } else {
                    break;
                }
            }
            let n: i64 = num_str.parse().map_err(|e| format!("parse error: {}", e))?;
            tokens.push(Token::Number(n));
        } else if c.is_ascii_alphabetic() || c == '_' {
            let mut ident = String::new();
            while let Some(&ch) = chars.peek() {
                if ch.is_ascii_alphanumeric() || ch == '_' {
                    ident.push(ch);
                    chars.next();
                } else {
                    break;
                }
            }
            match ident.as_str() {
                "let" => tokens.push(Token::KeywordLet),
                _ => tokens.push(Token::Ident(ident)),
            }
        } else {
            match c {
                '+' => {
                    chars.next();
                    tokens.push(Token::Plus);
                }
                '-' => {
                    chars.next();
                    tokens.push(Token::Minus);
                }
                '*' => {
                    chars.next();
                    tokens.push(Token::Multiply);
                }
                '/' => {
                    chars.next();
                    tokens.push(Token::Divide);
                }
                '(' => {
                    chars.next();
                    tokens.push(Token::LParen);
                }
                ')' => {
                    chars.next();
                    tokens.push(Token::RParen);
                }
                '{' => {
                    chars.next();
                    tokens.push(Token::LBrace);
                }
                '}' => {
                    chars.next();
                    tokens.push(Token::RBrace);
                }
                ';' => {
                    chars.next();
                    tokens.push(Token::Semicolon);
                }
                '=' => {
                    chars.next();
                    tokens.push(Token::Eq);
                }
                _ => return Err(format!("unexpected character: '{}'", c)),
            }
        }
    }

    Ok(tokens)
}

/// Variable scope for tracking let bindings.
struct Scope {
    vars: std::collections::HashMap<String, i64>,
}

impl Scope {
    fn new() -> Self {
        Scope {
            vars: std::collections::HashMap::new(),
        }
    }

    fn get(&self, name: &str) -> Option<i64> {
        self.vars.get(name).copied()
    }

    fn set(&mut self, name: String, value: i64) {
        self.vars.insert(name, value);
    }
}

/// Recursive descent parser/evaluator.
/// Grammar:
///   expr     -> term (('+' | '-') term)*
///   term     -> primary (('*' | '/') primary)*
///   primary  -> NUMBER | IDENT | '(' expr ')' | '{' stmt_list '}'
struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn new(tokens: Vec<Token>) -> Self {
        Parser { tokens, pos: 0 }
    }

    fn peek(&self) -> &Token {
        self.tokens.get(self.pos).unwrap_or(&Token::Eof)
    }

    fn consume(&mut self) -> Token {
        let token = self.peek().clone();
        self.pos += 1;
        token
    }

    /// expr -> term (('+' | '-') term)*
    fn parse_expr(&mut self, scope: &mut Scope) -> Result<i64, String> {
        let mut result = self.parse_term(scope)?;
        while matches!(self.peek(), Token::Plus | Token::Minus) {
            let op = self.consume();
            let rhs = self.parse_term(scope)?;
            match op {
                Token::Plus => result += rhs,
                Token::Minus => result -= rhs,
                _ => unreachable!(),
            }
        }
        Ok(result)
    }

    /// term -> primary (('*' | '/') primary)*
    fn parse_term(&mut self, scope: &mut Scope) -> Result<i64, String> {
        let mut result = self.parse_primary(scope)?;
        while matches!(self.peek(), Token::Multiply | Token::Divide) {
            let op = self.consume();
            let rhs = self.parse_primary(scope)?;
            match op {
                Token::Multiply => result *= rhs,
                Token::Divide => {
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

    /// primary -> NUMBER | IDENT | '(' expr ')' | '{' stmt_list '}'
    fn parse_primary(&mut self, scope: &mut Scope) -> Result<i64, String> {
        match self.peek().clone() {
            Token::Number(n) => {
                self.consume();
                Ok(n)
            }
            Token::Ident(name) => {
                self.consume();
                scope
                    .get(&name)
                    .ok_or_else(|| format!("undefined variable: {}", name))
            }
            Token::LParen => {
                self.consume(); // consume '('
                let result = self.parse_expr(scope)?;
                match self.peek().clone() {
                    Token::RParen => {
                        self.consume(); // consume ')'
                        Ok(result)
                    }
                    other => Err(format!("expected ')', got {:?}", other)),
                }
            }
            Token::LBrace => {
                self.consume(); // consume '{'
                let result = self.parse_block(scope)?;
                match self.peek().clone() {
                    Token::RBrace => {
                        self.consume(); // consume '}'
                        Ok(result)
                    }
                    other => Err(format!("expected '}}', got {:?}", other)),
                }
            }
            other => Err(format!("expected primary, got {:?}", other)),
        }
    }

    /// Parse statements inside a braced block.
    /// stmt_list -> (let_stmt | expr)*
    /// let_stmt  -> 'let' IDENT '=' expr ';'
    fn parse_block(&mut self, scope: &mut Scope) -> Result<i64, String> {
        loop {
            match self.peek().clone() {
                Token::RBrace => return Ok(0),
                Token::KeywordLet => {
                    // let x = expr;
                    self.consume(); // consume 'let'
                    let name = match self.peek().clone() {
                        Token::Ident(n) => {
                            self.consume();
                            n
                        }
                        other => {
                            return Err(format!(
                                "expected identifier after 'let', got {:?}",
                                other
                            ));
                        }
                    };
                    // expect '='
                    match self.peek().clone() {
                        Token::Eq => {
                            self.consume();
                        }
                        other => return Err(format!("expected '=', got {:?}", other)),
                    }
                    let value = self.parse_expr(scope)?;
                    match self.peek().clone() {
                        Token::Semicolon => {
                            self.consume();
                        }
                        other => return Err(format!("expected ';', got {:?}", other)),
                    }
                    scope.set(name, value);
                }
                _ => {
                    // It's an expression statement
                    let result = self.parse_expr(scope)?;
                    match self.peek().clone() {
                        Token::Semicolon => {
                            self.consume();
                        }
                        Token::RBrace => return Ok(result),
                        other => return Err(format!("expected ';' or '}}', got {:?}", other)),
                    }
                }
            }
        }
    }
}

fn interpret_tuff(input: &str) -> Result<i64, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }
    let tokens = tokenize(trimmed)?;
    let mut parser = Parser::new(tokens);
    let mut scope = Scope::new();
    parser.parse_expr(&mut scope)
}

#[cfg(not(test))]
use std::io::{self, Write};

#[cfg(not(test))]
fn main() {
    println!("Welcome to Tuff REPL! Type an expression or 'quit' to exit.");
    loop {
        io::stdout().flush().unwrap();
        print!("> ");
        let mut input = String::new();
        match io::stdin().read_line(&mut input) {
            Ok(_) => {
                let trimmed = input.trim();
                if trimmed.eq_ignore_ascii_case("quit") || trimmed == "exit" {
                    break;
                }
                if trimmed.is_empty() {
                    continue;
                }
                match interpret_tuff(trimmed) {
                    Ok(result) => println!("{}", result),
                    Err(e) => println!("Error: {}", e),
                }
            }
            Err(e) => println!("Failed to read input: {}", e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string() {
        assert_eq!(interpret_tuff("").unwrap(), 0);
    }

    #[test]
    fn test_whitespace_returns_zero() {
        assert_eq!(interpret_tuff("   ").unwrap(), 0);
    }

    #[test]
    fn test_numeric_string() {
        assert_eq!(interpret_tuff("100").unwrap(), 100);
    }

    #[test]
    fn test_addition() {
        assert_eq!(interpret_tuff("1 + 2").unwrap(), 3);
    }

    #[test]
    fn test_chained_addition() {
        assert_eq!(interpret_tuff("1 + 2 + 3").unwrap(), 6);
    }

    #[test]
    fn test_subtraction() {
        assert_eq!(interpret_tuff("5 - 3").unwrap(), 2);
    }

    #[test]
    fn test_chained_subtraction() {
        assert_eq!(interpret_tuff("10 - 4 - 2").unwrap(), 4);
    }

    #[test]
    fn test_multiplication() {
        assert_eq!(interpret_tuff("3 * 4").unwrap(), 12);
    }

    #[test]
    fn test_division() {
        assert_eq!(interpret_tuff("10 / 2").unwrap(), 5);
    }

    #[test]
    fn test_mixed_precedence() {
        // multiplication before addition: 1 + 2 * 3 = 7, not 9
        assert_eq!(interpret_tuff("1 + 2 * 3").unwrap(), 7);
    }

    #[test]
    fn test_complex_expression() {
        // (left-to-right within same precedence)
        assert_eq!(interpret_tuff("2 * 3 + 4 / 2 - 1").unwrap(), 7);
    }

    #[test]
    fn test_division_by_zero() {
        let err = interpret_tuff("5 / 0").unwrap_err();
        assert_eq!(err, "division by zero");
    }

    #[test]
    fn test_invalid_input_returns_error() {
        assert!(interpret_tuff("invalid").is_err());
    }

    #[test]
    fn test_unexpected_character() {
        let err = interpret_tuff("1 @ 2").unwrap_err();
        assert_eq!(err, "unexpected character: '@'");
    }

    #[test]
    fn test_undefined_variable() {
        // Identifiers are now valid tokens; referencing undefined var gives runtime error
        let err = interpret_tuff("x + 1").unwrap_err();
        assert_eq!(err, "undefined variable: x");
    }

    #[test]
    fn test_operator_without_operand() {
        // Triggers parse_primary error path (operator where primary expected)
        assert!(interpret_tuff("+ 5").is_err());
    }

    #[test]
    fn test_parenthesized_expression() {
        assert_eq!(interpret_tuff("(3 + 4) * 2").unwrap(), 14);
    }

    #[test]
    fn test_braced_expression() {
        assert_eq!(interpret_tuff("{ 3 + 4 } * 2").unwrap(), 14);
    }

    #[test]
    fn test_let_binding_in_block() {
        assert_eq!(interpret_tuff("{ let x = 3 + 4; x } * 2").unwrap(), 14);
    }

    #[test]
    fn test_mismatched_paren() {
        // Missing closing paren: '(' expr without ')'
        let err = interpret_tuff("(3 + 4").unwrap_err();
        assert!(err.contains("expected"));
    }

    #[test]
    fn test_let_missing_semicolon() {
        // let binding missing semicolon before closing brace
        let err = interpret_tuff("{ let x = 1 } ").unwrap_err();
        assert!(err.contains("expected"));

    }

    #[test]
    fn test_let_no_identifier() {
        // 'let' followed by something other than an identifier
        let err = interpret_tuff("{ let 5 = 3; x }").unwrap_err();
        assert!(err.contains("expected"));
    }

    #[test]
    fn test_let_missing_equals() {
        // 'let' binding missing '=' sign
        let err = interpret_tuff("{ let x 5; x }").unwrap_err();
        assert!(err.contains("expected"));
    }
}