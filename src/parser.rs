use crate::ast::Term;
use crate::errors::Error;
use crate::lexer::Token;

/// Convert a token stream into a flat list of terms.
///
/// Returns an error if the token sequence is malformed (e.g. two operators
/// in a row, or a trailing operator).
pub fn parse(tokens: &[Token]) -> Result<Vec<Term>, Error> {
    let mut terms: Vec<Term> = Vec::new();
    let mut pending_op: Option<char> = None;

    for token in tokens {
        match token {
            Token::Number(val) => {
                let op = pending_op.take().unwrap_or('+');
                terms.push(Term { op, value: *val });
            }
            Token::Plus => {
                if pending_op.is_some() {
                    return Err(Error::UnexpectedChar {
                        span: crate::errors::Span { start: 0, end: 0 },
                        ch: '+',
                    });
                }
                pending_op = Some('+');
            }
            Token::Minus => {
                if pending_op.is_some() {
                    return Err(Error::UnexpectedChar {
                        span: crate::errors::Span { start: 0, end: 0 },
                        ch: '-',
                    });
                }
                pending_op = Some('-');
            }
            Token::Star => {
                if pending_op.is_some() {
                    return Err(Error::UnexpectedChar {
                        span: crate::errors::Span { start: 0, end: 0 },
                        ch: '*',
                    });
                }
                pending_op = Some('*');
            }
        }
    }
    if pending_op.is_some() {
        // Trailing operator with no operand
        return Err(Error::UnexpectedChar {
            span: crate::errors::Span { start: 0, end: 0 },
            ch: pending_op.unwrap(),
        });
    }
    Ok(terms)
}
