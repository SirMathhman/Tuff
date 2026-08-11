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
    Mut,
    Identifier(String),
    Equals,
    Semicolon,
    Eof,
}

struct Parser<'a> {
    tokens: Vec<Token>,
    pos: usize,
    scope: std::collections::HashMap<String, (i64, bool)>,
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

    fn parse_let_statement(&mut self) -> Result<i64, String> {
        self.eat(); // eat 'let'
        let mut mutable = false;
        if self.current_token() == Token::Mut {
            self.eat(); // eat 'mut'
            mutable = true;
        }
        let name = match self.current_token().clone() {
            Token::Identifier(n) => n,
            _ => String::new(),
        };
        self.eat(); // eat identifier
        self.eat(); // eat '='
        let value = self.parse_expression()?;
        self.scope.insert(name, (value, mutable));
        if self.current_token() == Token::Semicolon {
            self.eat();
        }
        Ok(0i64)
    }

    fn parse_assignment(&mut self) -> Result<i64, String> {
        let name = match self.current_token().clone() {
            Token::Identifier(n) => n,
            _ => String::new(),
        };
        self.eat(); // eat identifier
        self.eat(); // eat '='
        let value = self.parse_expression()?;
        if let Some((_, mutable)) = self.scope.get(&name) {
            if !mutable {
                return Err(format!("cannot assign to immutable variable `{}`", name));
            }
        }
        self.scope.insert(name, (value, true));
        if self.current_token() == Token::Semicolon {
            self.eat();
        }
        Ok(0i64)
    }

    fn parse_expression(&mut self) -> Result<i64, String> {
        let mut left = self.parse_term()?;
        while matches!(self.current_token(), Token::Plus | Token::Minus) {
            let op = self.eat();
            let right = self.parse_term()?;
            left = match op {
                Token::Plus => left + right,
                Token::Minus => left - right,
                _ => unreachable!(),
            };
        }
        Ok(left)
    }

    fn parse_term(&mut self) -> Result<i64, String> {
        let mut left = self.parse_factor()?;
        while matches!(self.current_token(), Token::Multiply | Token::Divide) {
            let op = self.eat();
            let right = self.parse_factor()?;
            left = match op {
                Token::Multiply => left * right,
                Token::Divide => left / right,
                _ => unreachable!(),
            };
        }
        Ok(left)
    }

    fn parse_factor(&mut self) -> Result<i64, String> {
        let token = self.current_token().clone();
        if let Token::Number(n) = token {
            self.eat();
            Ok(n)
        } else if token == Token::LParen {
            self.eat();
            let value = self.parse_expression()?;
            if self.current_token() == Token::RParen {
                self.eat();
            }
            Ok(value)
        } else if let Token::Identifier(name) = token {
            self.eat();
            let (value, _) = self.scope.get(&name).unwrap_or(&(0, false));
            Ok(*value)
        } else {
            Ok(0)
        }
    }
}

#[allow(dead_code)]
fn evaluate(input: &str) -> Result<i64, String> {
    if input.trim().is_empty() {
        return Ok(0);
    }
    let chars: Vec<char> = input.chars().collect();
    let mut pos = 0;
    let mut tokens: Vec<Token> = Vec::new();
    while pos < chars.len() {
        if chars[pos].is_whitespace() {
            pos += 1;
            continue;
        }
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
                } else if ident == "mut" {
                    tokens.push(Token::Mut);
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
            parser.parse_let_statement()?;
        } else if matches!(parser.current_token(), Token::Identifier(_)) && parser.tokens.get(parser.pos + 1) == Some(&Token::Equals) {
            parser.parse_assignment()?;
        } else {
            result = parser.parse_expression()?;
            if parser.current_token() == Token::Semicolon {
                parser.eat();
            }
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evaluate_empty_string() {
        assert_eq!(evaluate(""), Ok(0));
    }

    #[test]
    fn test_evaluate_one() {
        assert_eq!(evaluate("1"), Ok(1));
    }

    #[test]
    fn test_evaluate_addition() {
        assert_eq!(evaluate("1 + 2"), Ok(3));
    }

    #[test]
    fn test_evaluate_chained_addition() {
        assert_eq!(evaluate("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn test_evaluate_addition_subtraction() {
        assert_eq!(evaluate("2 + 3 - 1"), Ok(4));
    }

    #[test]
    fn test_evaluate_multiplication_addition() {
        assert_eq!(evaluate("2 * 3 + 4"), Ok(10));
    }

    #[test]
    fn test_evaluate_parentheses() {
        assert_eq!(evaluate("2 * (3 + 4)"), Ok(14));
    }

    #[test]
    fn test_evaluate_multi_digit() {
        assert_eq!(evaluate("10 + 20"), Ok(30));
    }

    #[test]
    fn test_evaluate_curly_braces() {
        assert_eq!(evaluate("2 * { 3 + 4 }"), Ok(14));
    }

    #[test]
    fn test_evaluate_let_binding() {
        assert_eq!(evaluate("2 * { let x = 3 + 4; x }"), Ok(14));
    }

    #[test]
    fn test_evaluate_nested_let() {
        assert_eq!(evaluate("let y = 2 * { let x = 3 + 4; x }; y"), Ok(14));
    }

    #[test]
    fn test_evaluate_let_statement_only() {
        assert_eq!(evaluate("let x = 100;"), Ok(0));
    }

    #[test]
    fn test_evaluate_mut_let_and_reassign() {
        assert_eq!(evaluate("let mut x = 0; x = 1; x"), Ok(1));
    }

    #[test]
    fn test_evaluate_reassign_immutable() {
        assert!(evaluate("let x = 100; x = 0;").is_err());
    }
}
