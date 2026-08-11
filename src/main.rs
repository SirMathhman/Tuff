fn main() {
    println!("Hello, world!");
}

#[derive(Debug, PartialEq, Clone)]
enum Token {
    Number(i64),
    Plus,
    Minus,
    Multiply,
    Divide,
    LParen,
    RParen,
    Let,
    Identifier(String),
    Equals,
    Semicolon,
    Eof,
}

struct Parser<'a> {
    tokens: Vec<Token>,
    pos: usize,
    scope: std::collections::HashMap<String, i64>,
    _marker: std::marker::PhantomData<&'a str>,
}

impl<'a> Parser<'a> {
    fn current_token(&self) -> Token {
        if self.pos < self.tokens.len() {
            self.tokens[self.pos].clone()
        } else {
            Token::Eof
        }
    }

    fn eat(&mut self) -> Token {
        let token = self.current_token().clone();
        if self.pos < self.tokens.len() {
            self.pos += 1;
        }
        token
    }

    fn parse_let_statement(&mut self) -> i64 {
        self.eat(); // eat 'let'
        let name = match self.current_token().clone() {
            Token::Identifier(n) => n,
            _ => String::new(),
        };
        self.eat(); // eat identifier
        self.eat(); // eat '='
        let value = self.parse_expression();
        self.scope.insert(name, value);
        if self.current_token() == Token::Semicolon {
            self.eat();
        }
        0i64
    }

    fn parse_expression(&mut self) -> i64 {
        let mut left = self.parse_term();
        while matches!(self.current_token(), Token::Plus | Token::Minus) {
            let op = self.eat();
            let right = self.parse_term();
            left = match op {
                Token::Plus => left + right,
                Token::Minus => left - right,
                _ => unreachable!(),
            };
        }
        left
    }

    fn parse_term(&mut self) -> i64 {
        let mut left = self.parse_factor();
        while matches!(self.current_token(), Token::Multiply | Token::Divide) {
            let op = self.eat();
            let right = self.parse_factor();
            left = match op {
                Token::Multiply => left * right,
                Token::Divide => left / right,
                _ => unreachable!(),
            };
        }
        left
    }

    fn parse_factor(&mut self) -> i64 {
        let token = self.current_token().clone();
        if let Token::Number(n) = token {
            self.eat();
            n
        } else if token == Token::LParen {
            self.eat();
            let value = self.parse_expression();
            if self.current_token() == Token::RParen {
                self.eat();
            }
            value
        } else if let Token::Identifier(name) = token {
            self.eat();
            *self.scope.get(&name).unwrap_or(&0)
        } else {
            0
        }
    }
}

#[allow(dead_code)]
fn evaluate(input: &str) -> i64 {
    if input.trim().is_empty() {
        return 0;
    }
    let chars: Vec<char> = input.chars().filter(|c| !c.is_whitespace()).collect();
    let mut pos = 0;
    let mut tokens: Vec<Token> = Vec::new();
    while pos < chars.len() {
        let c = chars[pos];
        match c {
            '+' => { tokens.push(Token::Plus); pos += 1; }
            '-' => { tokens.push(Token::Minus); pos += 1; }
            '*' => { tokens.push(Token::Multiply); pos += 1; }
            '/' => { tokens.push(Token::Divide); pos += 1; }
            '(' => { tokens.push(Token::LParen); pos += 1; }
            ')' => { tokens.push(Token::RParen); pos += 1; }
            '{' => { tokens.push(Token::LParen); pos += 1; }
            '}' => { tokens.push(Token::RParen); pos += 1; }
            '=' => { tokens.push(Token::Equals); pos += 1; }
            ';' => { tokens.push(Token::Semicolon); pos += 1; }
            _ if c.is_ascii_digit() => {
                let mut num = String::new();
                while pos < chars.len() && chars[pos].is_ascii_digit() {
                    num.push(chars[pos]);
                    pos += 1;
                }
                tokens.push(Token::Number(num.parse::<i64>().unwrap_or(0)));
            }
            _ if c.is_ascii_alphabetic() || c == '_' => {
                let mut ident = String::new();
                while pos < chars.len() && (chars[pos].is_ascii_alphanumeric() || chars[pos] == '_') {
                    ident.push(chars[pos]);
                    pos += 1;
                }
                if ident == "let" {
                    tokens.push(Token::Let);
                } else {
                    tokens.push(Token::Identifier(ident));
                }
            }
            _ => { pos += 1; }
        }
    }
    let mut parser = Parser {
        tokens,
        pos: 0,
        scope: std::collections::HashMap::new(),
        _marker: std::marker::PhantomData,
    };
    let mut result = 0i64;
    let mut iterations = 0;
    let max_iterations = 1000;
    while parser.current_token() != Token::Eof {
        if iterations >= max_iterations {
            break;
        }
        iterations += 1;
        if parser.current_token() == Token::Let {
            parser.parse_let_statement();
        } else {
            result = parser.parse_expression();
            if parser.current_token() == Token::Semicolon {
                parser.eat();
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evaluate_empty_string() {
        assert_eq!(evaluate(""), 0);
    }

    #[test]
    fn test_evaluate_one() {
        assert_eq!(evaluate("1"), 1);
    }

    #[test]
    fn test_evaluate_addition() {
        assert_eq!(evaluate("1 + 2"), 3);
    }

    #[test]
    fn test_evaluate_chained_addition() {
        assert_eq!(evaluate("1 + 2 + 3"), 6);
    }

    #[test]
    fn test_evaluate_addition_subtraction() {
        assert_eq!(evaluate("2 + 3 - 1"), 4);
    }

    #[test]
    fn test_evaluate_multiplication_addition() {
        assert_eq!(evaluate("2 * 3 + 4"), 10);
    }

    #[test]
    fn test_evaluate_parentheses() {
        assert_eq!(evaluate("2 * (3 + 4)"), 14);
    }

    #[test]
    fn test_evaluate_multi_digit() {
        assert_eq!(evaluate("10 + 20"), 30);
    }

    #[test]
    fn test_evaluate_curly_braces() {
        assert_eq!(evaluate("2 * { 3 + 4 }"), 14);
    }

    #[test]
    fn test_evaluate_let_binding() {
        assert_eq!(evaluate("2 * { let x = 3 + 4; x }"), 14);
    }

    #[test]
    fn test_evaluate_nested_let() {
        assert_eq!(evaluate("let y = 2 * { let x = 3 + 4; x }; y"), 14);
    }

    #[test]
    fn test_evaluate_let_statement_only() {
        assert_eq!(evaluate("let x = 100;"), 0);
    }
}
