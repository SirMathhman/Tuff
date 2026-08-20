use crate::Error;

/// Recursive-descent parser over `input`, tracking the byte offset
/// (`pos`) so errors can point at the original source, and the
/// environment (`env`): a stack of scopes, each a list of `let`
/// bindings in declaration order.
pub(crate) struct Parser<'a> {
    pub(crate) input: &'a str,
    pub(crate) pos: usize,
    pub(crate) env: Vec<Vec<(String, i64)>>,
}

impl<'a> Parser<'a> {
    /// Parses the top-level program: `;`-separated statements; the
    /// program's value is the value of the last statement.
    pub(crate) fn parse_program(&mut self) -> Result<i64, Error> {
        self.env.push(Vec::new());
        let value = self.parse_program_body();
        self.env.pop();
        value
    }

    /// Parses the statements of the program; the program ends at the
    /// end of the input.
    fn parse_program_body(&mut self) -> Result<i64, Error> {
        let mut value = None;
        loop {
            self.skip_spaces();
            if self.pos >= self.input.len() {
                return value.ok_or(Error::UnsupportedSyntax { offset: self.pos });
            }
            value = Some(self.parse_statement()?);
            self.skip_spaces();
            if self.pos >= self.input.len() {
                return Ok(value.unwrap());
            }
            if self.peek() == Some(b';') {
                self.pos += 1;
            } else {
                return Err(Error::UnsupportedSyntax { offset: self.pos });
            }
        }
    }

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

    /// Parses `factor = number | boolean | identifier | '(' expr ')'
    /// | block`.
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
            Some(b'a'..=b'z') => {
                if let Some(value) = self.parse_boolean() {
                    Ok(value)
                } else {
                    self.parse_identifier()
                }
            }
            _ => Err(Error::UnsupportedSyntax { offset: self.pos }),
        }
    }

    /// Parses a boolean literal (`true` is `1`, `false` is `0`) if
    /// the current position starts one; otherwise returns `None`.
    fn parse_boolean(&mut self) -> Option<i64> {
        let rest = &self.input[self.pos..];
        let (value, len) = if rest.starts_with("true") {
            (1, 4)
        } else if rest.starts_with("false") {
            (0, 5)
        } else {
            return None;
        };
        if rest
            .as_bytes()
            .get(len)
            .is_some_and(|c| c.is_ascii_lowercase())
        {
            return None;
        }
        self.pos += len;
        Some(value)
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
    /// A block must end with an expression, so a trailing `let`
    /// statement is an error.
    fn parse_block_body(&mut self, close: u8) -> Result<i64, Error> {
        let mut value = None;
        let mut last_was_let = false;
        loop {
            self.skip_spaces();
            if self.peek() == Some(close) {
                self.pos += 1;
                if last_was_let {
                    return Err(Error::UnsupportedSyntax {
                        offset: self.pos - 1,
                    });
                }
                return value.ok_or(Error::UnsupportedSyntax {
                    offset: self.pos - 1,
                });
            }
            last_was_let = self.is_let();
            value = Some(if last_was_let {
                self.parse_let()?
            } else {
                self.parse_expr()?
            });
            self.skip_spaces();
            match self.peek() {
                Some(b';') => {
                    self.pos += 1;
                }
                Some(c) if c == close => {
                    self.pos += 1;
                    if last_was_let {
                        return Err(Error::UnsupportedSyntax {
                            offset: self.pos - 1,
                        });
                    }
                    return Ok(value.unwrap());
                }
                _ => return Err(Error::UnsupportedSyntax { offset: self.pos }),
            }
        }
    }

    /// Whether the next statement is a `let` binding.
    fn is_let(&self) -> bool {
        self.peek() == Some(b'l') && self.input[self.pos..].starts_with("let ")
    }

    /// Parses a statement: `let name = expr` or an expression.
    fn parse_statement(&mut self) -> Result<i64, Error> {
        self.skip_spaces();
        if self.is_let() {
            return self.parse_let();
        }
        self.parse_expr()
    }

    /// Parses `let name = expr`, consuming the `let` keyword. The
    /// binding is recorded in the current scope; the statement itself
    /// evaluates to `0`.
    fn parse_let(&mut self) -> Result<i64, Error> {
        self.pos += 4; // skip `let `
        let (name, _) = self.parse_identifier_name()?;
        self.skip_spaces();
        if self.peek() != Some(b'=') {
            return Err(Error::UnsupportedSyntax { offset: self.pos });
        }
        self.pos += 1;
        let value = self.parse_expr()?;
        self.env.last_mut().unwrap().push((name, value));
        Ok(0)
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
