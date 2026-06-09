/// Token types for the Tuff expression language
#[derive(Debug, Clone)]
enum Token {
    Number(i64),
    Plus,
    Minus,
    Multiply,
    Divide,
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
                _ => return Err(format!("unexpected character: '{}'", c)),
            }
        }
    }

    Ok(tokens)
}

/// Recursive descent parser/evaluator.
/// Grammar:
///   expr  -> term (('+' | '-') term)*
///   term  -> number (('*' | '/') number)*
///   number -> INTEGER
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
    fn parse_expr(&mut self) -> Result<i64, String> {
        let mut result = self.parse_term()?;
        while matches!(self.peek(), Token::Plus | Token::Minus) {
            let op = self.consume();
            let rhs = self.parse_term()?;
            match op {
                Token::Plus => result += rhs,
                Token::Minus => result -= rhs,
                _ => unreachable!(),
            }
        }
        Ok(result)
    }

    /// term -> number (('*' | '/') number)*
    fn parse_term(&mut self) -> Result<i64, String> {
        let mut result = self.parse_number()?;
        while matches!(self.peek(), Token::Multiply | Token::Divide) {
            let op = self.consume();
            let rhs = self.parse_number()?;
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

    /// number -> INTEGER
    fn parse_number(&mut self) -> Result<i64, String> {
        match self.peek().clone() {
            Token::Number(n) => {
                self.consume();
                Ok(n)
            }
            other => Err(format!("expected number, got {:?}", other)),
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
    parser.parse_expr()
}

use std::io::{self, Write};

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
    fn test_invalid_input_returns_error() {
        assert!(interpret_tuff("invalid").is_err());
    }
}
