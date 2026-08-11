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
    Eof,
}

struct Parser<'a> {
    tokens: Vec<Token>,
    pos: usize,
    _marker: std::marker::PhantomData<&'a str>,
}

impl<'a> Parser<'a> {
    fn current_token(&self) -> &Token {
        if self.pos < self.tokens.len() {
            &self.tokens[self.pos]
        } else {
            &Token::Eof
        }
    }

    fn eat(&mut self) -> Token {
        let token = self.current_token().clone();
        if self.pos < self.tokens.len() {
            self.pos += 1;
        }
        token
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
    let tokens: Vec<Token> = input
        .split_whitespace()
        .map(|s| {
            match s {
                "+" => Token::Plus,
                "-" => Token::Minus,
                "*" => Token::Multiply,
                "/" => Token::Divide,
                _ => Token::Number(s.parse::<i64>().unwrap_or(0)),
            }
        })
        .collect();
    let mut parser = Parser {
        tokens,
        pos: 0,
        _marker: std::marker::PhantomData,
    };
    parser.parse_expression()
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
}
