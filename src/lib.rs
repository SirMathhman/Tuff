use std::fmt;

/// Error returned by [`interpret`] when the input cannot be interpreted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The input uses syntax that is not yet supported.
    UnsupportedSyntax {
        /// Byte offset of the first offending character.
        offset: usize,
    },
    /// The result of an operation does not fit in an `i64`.
    Overflow {
        /// Byte offset of the operator that caused the overflow.
        offset: usize,
    },
    /// A variable was referenced that was not bound by an enclosing `let`.
    UndefinedVariable {
        /// Byte offset of the variable name.
        offset: usize,
        /// The name of the undefined variable.
        name: String,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::UnsupportedSyntax { offset } => {
                write!(f, "unsupported syntax at offset {offset}")
            }
            Error::Overflow { offset } => {
                write!(
                    f,
                    "arithmetic overflow at offset {offset}: the result does not fit in an i64; reduce the operands"
                )
            }
            Error::UndefinedVariable { offset, name } => {
                write!(
                    f,
                    "undefined variable '{name}' at offset {offset}: bind it with a `let` in an enclosing block"
                )
            }
        }
    }
}

impl std::error::Error for Error {}

/// Interprets `input` and returns its value.
///
/// The bare minimum for now: an empty string is `0`; a non-negative
/// integer literal is its value; a chain of literals joined by `+`,
/// `-`, or `*` (optional surrounding spaces) is evaluated with `*`
/// binding tighter than `+`/`-`; parentheses group subexpressions;
/// curly braces delimit blocks of `let` bindings ending in an
/// expression, whose value is the block's value; anything else is not
/// yet supported.
pub fn interpret(input: &str) -> Result<i64, Error> {
    if input.is_empty() {
        return Ok(0);
    }
    let mut parser = Parser {
        input,
        pos: 0,
        env: Vec::new(),
    };
    let value = parser.parse_expr()?;
    parser.skip_spaces();
    if parser.pos < input.len() {
        return Err(Error::UnsupportedSyntax { offset: parser.pos });
    }
    Ok(value)
}

/// Recursive-descent parser over `input`, tracking the byte offset
/// (`pos`) so errors can point at the original source, and the
/// environment (`env`): a stack of scopes, each a list of `let`
/// bindings in declaration order.
struct Parser<'a> {
    input: &'a str,
    pos: usize,
    env: Vec<Vec<(String, i64)>>,
}

impl<'a> Parser<'a> {
    /// Parses `expr = term (('+' | '-') term)*`.
    fn parse_expr(&mut self) -> Result<i64, Error> {
        let mut total = self.parse_term()?;
        loop {
            self.skip_spaces();
            match self.peek() {
                Some(b'+') => {
                    let offset = self.pos;
                    self.pos += 1;
                    total = total
                        .checked_add(self.parse_term()?)
                        .ok_or(Error::Overflow { offset })?;
                }
                Some(b'-') => {
                    let offset = self.pos;
                    self.pos += 1;
                    total = total
                        .checked_sub(self.parse_term()?)
                        .ok_or(Error::Overflow { offset })?;
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
                let offset = self.pos;
                self.pos += 1;
                term = term
                    .checked_mul(self.parse_factor()?)
                    .ok_or(Error::Overflow { offset })?;
            } else {
                return Ok(term);
            }
        }
    }

    /// Parses `factor = number | identifier | '(' expr ')' | block`.
    fn parse_factor(&mut self) -> Result<i64, Error> {
        self.skip_spaces();
        match self.peek() {
            Some(b'(') => {
                self.pos += 1;
                self.parse_grouped(b')')
            }
            Some(b'{') => {
                self.pos += 1;
                self.parse_block(b'}')
            }
            Some(b'0'..=b'9') => self.parse_number(),
            Some(b'a'..=b'z') => self.parse_identifier(),
            _ => Err(Error::UnsupportedSyntax { offset: self.pos }),
        }
    }

    /// Parses a block: `let` bindings separated by `;`, ending in an
    /// expression whose value is the block's value.
    fn parse_block(&mut self, close: u8) -> Result<i64, Error> {
        self.env.push(Vec::new());
        let value = self.parse_block_body(close);
        self.env.pop();
        value
    }

    /// Parses the statements of a block; the opening delimiter has
    /// already been consumed and `close` is the expected closing one.
    fn parse_block_body(&mut self, close: u8) -> Result<i64, Error> {
        let mut value = None;
        loop {
            self.skip_spaces();
            if self.peek() == Some(close) {
                self.pos += 1;
                return value.ok_or(Error::UnsupportedSyntax {
                    offset: self.pos - 1,
                });
            }
            value = Some(self.parse_statement()?);
            self.skip_spaces();
            match self.peek() {
                Some(b';') => {
                    self.pos += 1;
                }
                Some(c) if c == close => {
                    self.pos += 1;
                    return Ok(value.unwrap());
                }
                _ => {
                    return Err(Error::UnsupportedSyntax {
                        offset: self.pos,
                    })
                }
            }
        }
    }

    /// Parses a statement: `let name = expr` or an expression.
    fn parse_statement(&mut self) -> Result<i64, Error> {
        self.skip_spaces();
        if self.peek() == Some(b'l') && self.input[self.pos..].starts_with("let ") {
            self.pos += 4;
            return self.parse_let();
        }
        self.parse_expr()
    }

    /// Parses `let name = expr` after the `let` keyword was consumed.
    fn parse_let(&mut self) -> Result<i64, Error> {
        let (name, _) = self.parse_identifier_name()?;
        self.skip_spaces();
        if self.peek() != Some(b'=') {
            return Err(Error::UnsupportedSyntax { offset: self.pos });
        }
        self.pos += 1;
        let value = self.parse_expr()?;
        self.env.last_mut().unwrap().push((name, value));
        Ok(value)
    }

    /// Parses an identifier and looks up its binding in the
    /// environment, innermost scope first.
    fn parse_identifier(&mut self) -> Result<i64, Error> {
        let (name, offset) = self.parse_identifier_name()?;
        for scope in self.env.iter().rev() {
            if let Some((_, value)) = scope.iter().find(|(n, _)| *n == name) {
                return Ok(*value);
            }
        }
        Err(Error::UndefinedVariable { offset, name })
    }

    /// Parses an identifier name starting at the current position,
    /// returning the name and its offset.
    fn parse_identifier_name(&mut self) -> Result<(String, usize), Error> {
        let start = self.pos;
        while matches!(self.peek(), Some(b'a'..=b'z')) {
            self.pos += 1;
        }
        if start == self.pos {
            return Err(Error::UnsupportedSyntax { offset: start });
        }
        Ok((self.input[start..self.pos].to_string(), start))
    }

    /// Parses a non-negative integer literal starting at the current
    /// position, reporting overflow if it does not fit in an `i64`.
    fn parse_number(&mut self) -> Result<i64, Error> {
        let start = self.pos;
        while matches!(self.peek(), Some(b'0'..=b'9')) {
            self.pos += 1;
        }
        self.input[start..self.pos]
            .parse::<i64>()
            .map_err(|_| Error::Overflow { offset: start })
    }

    /// Parses `expr close` after the opening delimiter was consumed;
    /// `close` is the expected matching closing delimiter.
    fn parse_grouped(&mut self, close: u8) -> Result<i64, Error> {
        let value = self.parse_expr()?;
        self.skip_spaces();
        match self.peek() {
            Some(c) if c == close => {
                self.pos += 1;
                Ok(value)
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
    fn multi_digit_number() {
        assert_eq!(interpret("20"), Ok(20));
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

    #[test]
    fn curly_braced_group() {
        assert_eq!(interpret("{ 2 + 3 } * 4"), Ok(20));
    }

    #[test]
    fn let_binding_in_block() {
        assert_eq!(interpret("{ let x = 2 + 3; x } * 4"), Ok(20));
    }

    #[test]
    fn multiplication_overflow_is_reported() {
        // 9^20 does not fit in an i64; the 19th `*` is at offset 74.
        let input = "9 * ".repeat(19) + "9";
        assert_eq!(interpret(&input), Err(Error::Overflow { offset: 74 }));
    }

    // Coverage test: non-empty input must yield Err, not panic.
    #[test]
    fn non_empty_input_is_unsupported() {
        assert_eq!(interpret("@"), Err(Error::UnsupportedSyntax { offset: 0 }));
    }

    #[test]
    fn unsupported_syntax_reports_true_offset() {
        assert_eq!(
            interpret("1 + @"),
            Err(Error::UnsupportedSyntax { offset: 4 })
        );
    }

    #[test]
    fn undefined_variable_is_reported() {
        assert_eq!(
            interpret("x"),
            Err(Error::UndefinedVariable { offset: 0, name: "x".into() })
        );
    }
}
