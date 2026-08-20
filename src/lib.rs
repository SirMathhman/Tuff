use std::fmt;

/// Error returned by [`interpret`] when the input cannot be interpreted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The input uses syntax that is not yet supported.
    UnsupportedSyntax {
        /// Byte offset of the first offending character.
        offset: usize,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::UnsupportedSyntax { offset } => {
                write!(f, "unsupported syntax at offset {offset}")
            }
        }
    }
}

impl std::error::Error for Error {}

/// Interprets `input` and returns its value.
///
/// The bare minimum for now: an empty string is `0`; a single digit is
/// its value; a chain of single digits joined by `+`, `-`, or `*`
/// (optional surrounding spaces) is evaluated with `*` binding tighter
/// than `+`/`-`; parentheses group subexpressions; anything else is
/// not yet supported.
pub fn interpret(input: &str) -> Result<i64, Error> {
    if input.is_empty() {
        return Ok(0);
    }
    let mut parser = Parser { input, pos: 0 };
    let value = parser.parse_expr()?;
    parser.skip_spaces();
    if parser.pos < input.len() {
        return Err(Error::UnsupportedSyntax { offset: parser.pos });
    }
    Ok(value)
}

/// Recursive-descent parser over `input`, tracking the byte offset
/// (`pos`) so errors can point at the original source.
struct Parser<'a> {
    input: &'a str,
    pos: usize,
}

impl<'a> Parser<'a> {
    /// Parses `expr = term (('+' | '-') term)*`.
    fn parse_expr(&mut self) -> Result<i64, Error> {
        let mut total = self.parse_term()?;
        loop {
            self.skip_spaces();
            match self.peek() {
                Some(b'+') => {
                    self.pos += 1;
                    total += self.parse_term()?;
                }
                Some(b'-') => {
                    self.pos += 1;
                    total -= self.parse_term()?;
                }
                _ => return Ok(total),
            }
        }
    }

    /// Parses `term = factor ('*' factor)*`.
    fn parse_term(&mut self) -> Result<i64, Error> {
        let mut term = self.parse_factor()?;
        loop {
            self.skip_spaces();
            if self.peek() == Some(b'*') {
                self.pos += 1;
                term *= self.parse_factor()?;
            } else {
                return Ok(term);
            }
        }
    }

    /// Parses `factor = digit | '(' expr ')'`.
    fn parse_factor(&mut self) -> Result<i64, Error> {
        self.skip_spaces();
        match self.peek() {
            Some(b'(') => {
                self.pos += 1;
                let value = self.parse_expr()?;
                self.skip_spaces();
                match self.peek() {
                    Some(b')') => {
                        self.pos += 1;
                        Ok(value)
                    }
                    _ => Err(Error::UnsupportedSyntax {
                        offset: self.pos,
                    }),
                }
            }
            Some(digit @ b'0'..=b'9') => {
                self.pos += 1;
                Ok((digit - b'0') as i64)
            }
            _ => Err(Error::UnsupportedSyntax { offset: self.pos }),
        }
    }

    /// The byte at the current position, if any.
    fn peek(&self) -> Option<u8> {
        self.input.as_bytes().get(self.pos).copied()
    }

    /// Advances past any spaces.
    fn skip_spaces(&mut self) {
        while self.peek() == Some(b' ') {
            self.pos += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string_is_zero() {
        assert_eq!(interpret(""), Ok(0));
    }

    #[test]
    fn single_digit_one() {
        assert_eq!(interpret("1"), Ok(1));
    }

    #[test]
    fn addition_of_two_digits() {
        assert_eq!(interpret("1 + 2"), Ok(3));
    }

    #[test]
    fn addition_of_three_digits() {
        assert_eq!(interpret("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn mixed_addition_and_subtraction() {
        assert_eq!(interpret("2 + 3 - 4"), Ok(1));
    }

    #[test]
    fn multiplication_binds_tighter_than_addition() {
        assert_eq!(interpret("2 * 3 + 4"), Ok(10));
    }

    #[test]
    fn addition_then_multiplication_term() {
        assert_eq!(interpret("2 + 3 * 4"), Ok(14));
    }

    #[test]
    fn parenthesized_group() {
        assert_eq!(interpret("(2 + 3) * 4"), Ok(20));
    }

    // Coverage test: non-empty input must yield Err, not panic.
    #[test]
    fn non_empty_input_is_unsupported() {
        assert_eq!(interpret("x"), Err(Error::UnsupportedSyntax { offset: 0 }));
    }

    #[test]
    fn unsupported_syntax_reports_true_offset() {
        assert_eq!(
            interpret("1 + x"),
            Err(Error::UnsupportedSyntax { offset: 4 })
        );
    }
}
