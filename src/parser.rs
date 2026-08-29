use crate::ast::Term;
use crate::lexer::Token;

/// Convert a token stream into a flat list of terms.
///
/// Infallible: the lexer guarantees the token stream is well-formed
/// (operand-operator alternation, no trailing operator), so every
/// sequence reaching the parser maps to a valid term list.
pub fn parse(tokens: &[Token]) -> Vec<Term> {
    let mut terms: Vec<Term> = Vec::new();
    let mut pending_op: Option<char> = None;

    for token in tokens {
        match token {
            Token::Number(val) => {
                let op = pending_op.take().unwrap_or('+');
                terms.push(Term { op, value: *val });
            }
            Token::Plus => pending_op = Some('+'),
            Token::Minus => pending_op = Some('-'),
            Token::Star => pending_op = Some('*'),
        }
    }
    terms
}
