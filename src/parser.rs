use crate::Span;
use crate::ast::{BinOp, Expr};
use crate::lexer::Token;

/// Parse a token stream into an expression AST.
pub fn parse(tokens: Vec<Token>) -> Result<Expr, crate::TuffError> {
    let mut parser = Parser { tokens, pos: 0 };
    let expr = parser.parse_expr()?;
    if parser.pos < parser.tokens.len() {
        let span = parser.tokens[parser.pos].span();
        return Err(crate::TuffError::Parse {
            span,
            message: "unexpected token after end of expression".to_string(),
        });
    }
    Ok(expr)
}

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn peek(&self) -> Option<Token> {
        self.tokens.get(self.pos).copied()
    }

    fn parse_expr(&mut self) -> Result<Expr, crate::TuffError> {
        let mut left = self.parse_term()?;
        loop {
            match self.peek() {
                Some(Token::Plus(span)) => {
                    self.pos += 1;
                    let right = self.parse_term()?;
                    left = Expr::Bin(BinOp::Add, Box::new(left), Box::new(right), span);
                }
                Some(Token::Minus(span)) => {
                    self.pos += 1;
                    let right = self.parse_term()?;
                    left = Expr::Bin(BinOp::Sub, Box::new(left), Box::new(right), span);
                }
                _ => break,
            }
        }
        Ok(left)
    }

    fn parse_term(&mut self) -> Result<Expr, crate::TuffError> {
        let mut left = self.parse_primary()?;
        while let Some(Token::Star(span)) = self.peek() {
            self.pos += 1;
            let right = self.parse_primary()?;
            left = Expr::Bin(BinOp::Mul, Box::new(left), Box::new(right), span);
        }
        Ok(left)
    }

    fn parse_primary(&mut self) -> Result<Expr, crate::TuffError> {
        match self.peek() {
            Some(Token::Num(value, span)) => {
                self.pos += 1;
                Ok(Expr::Num(value, span))
            }
            Some(token) => Err(crate::TuffError::Parse {
                span: token.span(),
                message: "expected a number".to_string(),
            }),
            None => Err(crate::TuffError::Parse {
                span: Span { start: 0, end: 0 },
                message: "expected a number".to_string(),
            }),
        }
    }
}

impl Token {
    fn span(&self) -> Span {
        match self {
            Token::Num(_, span) | Token::Plus(span) | Token::Minus(span) | Token::Star(span) => {
                *span
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexer::lex;

    #[test]
    fn parses_number() {
        assert_eq!(
            parse(lex("1").unwrap()),
            Ok(Expr::Num(1, Span { start: 0, end: 1 }))
        );
    }

    #[test]
    fn parses_precedence() {
        // 2 * 3 + 4 => Bin(Add, Bin(Mul, 2, 3), 4)
        let expr = parse(lex("2 * 3 + 4").unwrap()).unwrap();
        match &expr {
            Expr::Bin(BinOp::Add, left, right, _) => {
                assert!(matches!(&**left, Expr::Bin(BinOp::Mul, _, _, _)));
                assert!(matches!(&**right, Expr::Num(4, _)));
            }
            other => panic!("unexpected AST: {other:?}"),
        }
    }

    #[test]
    fn rejects_empty_input() {
        assert_eq!(
            parse(lex("").unwrap()),
            Err(crate::TuffError::Parse {
                span: Span { start: 0, end: 0 },
                message: "expected a number".to_string(),
            })
        );
    }
}
