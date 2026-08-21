use crate::Error;

/// A value produced by an expression: an integer, a boolean, an
/// array, a tuple, or a reference to a binding. Booleans are
/// distinct from integers — `==` only yields `true` for two values
/// of the same kind — but arithmetic treats a boolean as its numeric
/// value (`true` is `1`, `false` is `0`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Value {
    Int(i64),
    Bool(bool),
    Array(Vec<Value>),
    Tuple(Vec<Value>),
    Ref(String),
}

impl Value {
    /// Whether the value is truthy: non-zero for integers, the
    /// stored value for booleans, and `true` for arrays.
    pub(crate) fn is_truthy(&self) -> bool {
        match self {
            Value::Int(n) => *n != 0,
            Value::Bool(b) => *b,
            Value::Array(_) => true,
            Value::Tuple(_) => true,
            Value::Ref(_) => true,
        }
    }

    /// The numeric value of the value (`true` is `1`, `false` is
    /// `0`).
    pub(crate) fn as_i64(&self) -> i64 {
        match self {
            Value::Int(n) => *n,
            Value::Bool(b) => i64::from(*b),
            Value::Array(_) => 0,
            Value::Tuple(_) => 0,
            Value::Ref(_) => 0,
        }
    }

    /// The kind of the value, for error messages.
    pub(crate) fn kind(&self) -> &'static str {
        match self {
            Value::Int(_) => "integer",
            Value::Bool(_) => "boolean",
            Value::Array(_) => "array",
            Value::Tuple(_) => "tuple",
            Value::Ref(_) => "reference",
        }
    }

    /// The element at `index`, if the value is an array and the index
    /// is in range.
    pub(crate) fn index(&self, index: i64, offset: usize) -> Result<Value, Error> {
        match self {
            Value::Array(items) => {
                if index < 0 || (index as usize) >= items.len() {
                    return Err(Error::IndexOutOfBounds { offset });
                }
                Ok(items[index as usize].clone())
            }
            _ => Err(Error::NotAnArray { offset }),
        }
    }

    /// The element at `field`, if the value is a tuple and the field
    /// is in range.
    pub(crate) fn field(&self, field: i64, offset: usize) -> Result<Value, Error> {
        match self {
            Value::Tuple(items) => {
                if field < 0 || (field as usize) >= items.len() {
                    return Err(Error::IndexOutOfBounds { offset });
                }
                Ok(items[field as usize].clone())
            }
            _ => Err(Error::NotATuple { offset }),
        }
    }

    /// The value the reference points to, looked up in the
    /// environment, innermost scope first.
    pub(crate) fn deref(
        &self,
        env: &[Vec<(String, bool, Value)>],
        offset: usize,
    ) -> Result<Value, Error> {
        match self {
            Value::Ref(name) => {
                for scope in env.iter().rev() {
                    if let Some((_, _, value)) = scope.iter().find(|(n, _, _)| *n == *name) {
                        return Ok(value.clone());
                    }
                }
                Err(Error::UndefinedVariable {
                    offset,
                    name: name.clone(),
                })
            }
            _ => Err(Error::NotAReference { offset }),
        }
    }
}

/// Recursive-descent parser over `input`, tracking the byte offset
/// (`pos`) so errors can point at the original source, and the
/// environment (`env`): a stack of scopes, each a list of `let`
/// bindings in declaration order; each binding records whether it
/// was declared `mut`.
pub(crate) struct Parser<'a> {
    pub(crate) input: &'a str,
    pub(crate) pos: usize,
    pub(crate) env: Vec<Vec<(String, bool, Value)>>,
}

impl<'a> Parser<'a> {
    /// Parses the top-level program: `;`-separated statements; the
    /// program's value is the value of the last statement.
    pub(crate) fn parse_program(&mut self) -> Result<Value, Error> {
        self.env.push(Vec::new());
        let value = self.parse_program_body();
        self.env.pop();
        value
    }

    /// Parses the statements of the program; the program ends at the
    /// end of the input.
    fn parse_program_body(&mut self) -> Result<Value, Error> {
        let mut value: Option<Value> = None;
        loop {
            self.skip_spaces();
            if self.pos >= self.input.len() {
                return value.ok_or(Error::EmptyProgram { offset: self.pos });
            }
            value = Some(self.parse_statement()?);
            self.skip_spaces();
            if self.pos >= self.input.len() {
                return Ok(value.unwrap());
            }
            // A `;` between top-level statements is optional.
            if self.peek() == Some(b';') {
                self.pos += 1;
            }
        }
    }

    /// Parses `or = eq ('||' eq)*`; `||` binds looser than `==`, `+`,
    /// `-`, and `*`, and yields `true` if either side is truthy. When
    /// `as_expression` is false, a block may end in a statement.
    fn parse_or(&mut self, as_expression: bool) -> Result<Value, Error> {
        let mut value = self.parse_eq(as_expression)?;
        loop {
            self.skip_spaces();
            if self.input[self.pos..].starts_with("||") {
                self.pos += 2;
                let rhs = self.parse_eq(as_expression)?;
                value = Value::Bool(value.is_truthy() || rhs.is_truthy());
            } else {
                return Ok(value);
            }
        }
    }

    /// Parses `eq = expr ('==' expr)*`; `==` binds looser than `+`,
    /// `-`, and `*`, and yields `true` only if both sides are the same
    /// kind and equal.
    fn parse_eq(&mut self, as_expression: bool) -> Result<Value, Error> {
        let mut value = self.parse_expr(as_expression)?;
        loop {
            self.skip_spaces();
            if self.input[self.pos..].starts_with("==") {
                self.pos += 2;
                let rhs = self.parse_expr(as_expression)?;
                value = Value::Bool(value == rhs);
            } else {
                return Ok(value);
            }
        }
    }

    /// Parses `expr = term (('+' | '-') term)*`.
    fn parse_expr(&mut self, as_expression: bool) -> Result<Value, Error> {
        let mut total = self.parse_term(as_expression)?;
        loop {
            self.skip_spaces();
            match self.peek() {
                Some(b'+') => {
                    let offset = self.pos;
                    self.pos += 1;
                    let rhs = self.parse_term(as_expression)?.as_i64();
                    total = Value::Int(
                        total
                            .as_i64()
                            .checked_add(rhs)
                            .ok_or(Error::Overflow { offset })?,
                    );
                }
                Some(b'-') => {
                    let offset = self.pos;
                    self.pos += 1;
                    let rhs = self.parse_term(as_expression)?.as_i64();
                    total = Value::Int(
                        total
                            .as_i64()
                            .checked_sub(rhs)
                            .ok_or(Error::Overflow { offset })?,
                    );
                }
                _ => return Ok(total),
            }
        }
    }

    /// Parses `term = postfix ('*' postfix)*`.
    fn parse_term(&mut self, as_expression: bool) -> Result<Value, Error> {
        let mut term = self.parse_postfix(as_expression)?;
        loop {
            self.skip_spaces();
            if self.peek() == Some(b'*') {
                let offset = self.pos;
                self.pos += 1;
                let rhs = self.parse_postfix(as_expression)?.as_i64();
                term = Value::Int(
                    term.as_i64()
                        .checked_mul(rhs)
                        .ok_or(Error::Overflow { offset })?,
                );
            } else {
                return Ok(term);
            }
        }
    }

    /// Parses `postfix = factor ('[' expr ']' | '.' digit)*`: an
    /// array index or a tuple field applied to a factor, binding
    /// tighter than `*`, `+`, and `-`.
    fn parse_postfix(&mut self, as_expression: bool) -> Result<Value, Error> {
        let mut value = self.parse_factor(as_expression)?;
        loop {
            self.skip_spaces();
            match self.peek() {
                Some(b'[') => {
                    let offset = self.pos;
                    self.pos += 1;
                    let index = self.parse_or(true)?.as_i64();
                    self.skip_spaces();
                    if self.peek() != Some(b']') {
                        return Err(Error::ExpectedClosingDelimiter {
                            offset: self.pos,
                            expected: b']',
                        });
                    }
                    self.pos += 1;
                    value = value.index(index, offset)?;
                }
                Some(b'.') => {
                    let offset = self.pos;
                    self.pos += 1;
                    let Some(d) = self.peek().filter(|c| c.is_ascii_digit()) else {
                        return Err(Error::UnexpectedToken {
                            offset: self.pos,
                            found: self.peek(),
                        });
                    };
                    let field = i64::from(d - b'0');
                    self.pos += 1;
                    value = value.field(field, offset)?;
                }
                _ => return Ok(value),
            }
        }
    }

    /// Parses `factor = '&' identifier | '*' factor | number |
    /// boolean | identifier | '(' expr ')' | block | if`: `&name` is
    /// a reference to the binding `name`, and `*value` dereferences a
    /// reference. The prefix operators bind tighter than `*`, `+`,
    /// and `-`. When `as_expression` is false, a block may end in a
    /// statement and an `if` takes statement branches.
    fn parse_factor(&mut self, as_expression: bool) -> Result<Value, Error> {
        self.skip_spaces();
        if self.peek() == Some(b'&') {
            self.pos += 1;
            self.skip_spaces();
            let (name, _) = self.parse_identifier_name()?;
            return Ok(Value::Ref(name));
        }
        if self.peek() == Some(b'*') {
            let offset = self.pos;
            self.pos += 1;
            let value = self.parse_factor(as_expression)?;
            return value.deref(&self.env, offset);
        }
        match self.peek() {
            Some(b'(') => {
                if self.has_tuple_comma() {
                    self.parse_tuple()
                } else {
                    self.pos += 1;
                    self.parse_grouped(b')', as_expression)
                }
            }
            Some(b'{') => {
                self.pos += 1;
                self.parse_block(b'}', as_expression)
            }
            Some(b'[') => self.parse_array(),
            Some(b'0'..=b'9') => self.parse_number(),
            Some(b'a'..=b'z') => {
                if self.input[self.pos..].starts_with("if ") {
                    return self.parse_if(as_expression);
                }
                if let Some(value) = self.parse_boolean() {
                    Ok(value)
                } else {
                    self.parse_identifier()
                }
            }
            _ => Err(Error::UnexpectedToken {
                offset: self.pos,
                found: self.peek(),
            }),
        }
    }

    /// Parses `if (cond) then else alt`: the condition is a
    /// parenthesized expression; if it is truthy the value is the
    /// `then` expression, otherwise the `else` expression. When
    /// `as_expression` is false the branches are statements (so a
    /// block branch may end in a statement), otherwise they are
    /// expressions.
    fn parse_if(&mut self, as_expression: bool) -> Result<Value, Error> {
        self.pos += 3; // skip `if`
        self.skip_spaces();
        if self.peek() != Some(b'(') {
            return Err(Error::ExpectedClosingDelimiter {
                offset: self.pos,
                expected: b'(',
            });
        }
        self.pos += 1;
        let cond = self.parse_or(true)?;
        self.skip_spaces();
        if self.peek() != Some(b')') {
            return Err(Error::ExpectedClosingDelimiter {
                offset: self.pos,
                expected: b')',
            });
        }
        self.pos += 1;
        self.skip_spaces();
        // Both branches are checked (parsed and evaluated) so that
        // errors in either are reported. The chosen branch runs in
        // the live environment so its side effects persist; the
        // unchosen branch runs in a snapshot that is restored
        // afterward so its side effects do not.
        let chosen = cond.is_truthy();
        let then_env = if chosen { None } else { Some(self.env.clone()) };
        let then = if as_expression {
            self.parse_or(true)?
        } else {
            self.parse_statement()?
        };
        if let Some(env) = then_env {
            self.env = env;
        }
        self.skip_spaces();
        if !self.input[self.pos..].starts_with("else ") {
            return Err(Error::ExpectedElse { offset: self.pos });
        }
        self.pos += 5; // skip `else `
        let alt_env = if chosen { Some(self.env.clone()) } else { None };
        let alt = if as_expression {
            self.parse_or(true)?
        } else {
            self.parse_statement()?
        };
        if let Some(env) = alt_env {
            self.env = env;
        }
        Ok(if chosen { then } else { alt })
    }

    /// Parses an array literal `[expr, expr, ...]` after the opening
    /// `[` was consumed; the value is an array of the element values.
    fn parse_array(&mut self) -> Result<Value, Error> {
        self.pos += 1; // skip `[`
        let mut items = Vec::new();
        loop {
            self.skip_spaces();
            if self.peek() == Some(b']') {
                self.pos += 1;
                return Ok(Value::Array(items));
            }
            items.push(self.parse_or(true)?);
            self.skip_spaces();
            match self.peek() {
                Some(b',') => {
                    self.pos += 1;
                }
                Some(b']') => {
                    self.pos += 1;
                    return Ok(Value::Array(items));
                }
                _ => {
                    return Err(Error::ExpectedClosingDelimiter {
                        offset: self.pos,
                        expected: b']',
                    });
                }
            }
        }
    }

    /// Whether the `(` at the current position opens a tuple literal:
    /// a `,` appears before the matching `)`.
    fn has_tuple_comma(&self) -> bool {
        let mut i = self.pos + 1;
        while i < self.input.len() {
            match self.input.as_bytes()[i] {
                b',' => return true,
                b')' => return false,
                _ => i += 1,
            }
        }
        false
    }

    /// Parses a tuple literal `(expr, expr, ...)` after the opening
    /// `(` was consumed; the value is a tuple of the element values.
    fn parse_tuple(&mut self) -> Result<Value, Error> {
        self.pos += 1; // skip `(`
        let mut items = Vec::new();
        loop {
            self.skip_spaces();
            if self.peek() == Some(b')') {
                self.pos += 1;
                return Ok(Value::Tuple(items));
            }
            items.push(self.parse_or(true)?);
            self.skip_spaces();
            match self.peek() {
                Some(b',') => {
                    self.pos += 1;
                }
                Some(b')') => {
                    self.pos += 1;
                    return Ok(Value::Tuple(items));
                }
                _ => {
                    return Err(Error::ExpectedClosingDelimiter {
                        offset: self.pos,
                        expected: b')',
                    });
                }
            }
        }
    }

    /// Parses a boolean literal if the current position starts one;
    /// otherwise returns `None`.
    fn parse_boolean(&mut self) -> Option<Value> {
        let rest = &self.input[self.pos..];
        let (value, len) = if rest.starts_with("true") {
            (Value::Bool(true), 4)
        } else if rest.starts_with("false") {
            (Value::Bool(false), 5)
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
    /// expression whose value is the block's value. When
    /// `as_expression` is false the block may end in a statement.
    fn parse_block(&mut self, close: u8, as_expression: bool) -> Result<Value, Error> {
        self.env.push(Vec::new());
        let value = self.parse_block_body(close, as_expression);
        self.env.pop();
        value
    }

    /// Parses the statements of a block; the opening delimiter has
    /// already been consumed and `close` is the expected closing one.
    /// When `as_expression` is true a block must end with an
    /// expression, so a trailing `let` or assignment statement is an
    /// error; when false a block may end in a statement.
    fn parse_block_body(&mut self, close: u8, as_expression: bool) -> Result<Value, Error> {
        let mut value: Option<Value> = None;
        let mut last_was_statement = false;
        loop {
            self.skip_spaces();
            if self.peek() == Some(close) {
                self.pos += 1;
                if as_expression {
                    if last_was_statement {
                        return Err(Error::BlockMustEndWithExpression {
                            offset: self.pos - 1,
                        });
                    }
                    return value.ok_or(Error::BlockMustEndWithExpression {
                        offset: self.pos - 1,
                    });
                }
                return value.ok_or(Error::BlockMustEndWithExpression {
                    offset: self.pos - 1,
                });
            }
            // Save the position so the final statement can be re-parsed
            // in the block's context: a block's value-producing statement
            // must be an expression when the block is one.
            let saved = self.pos;
            last_was_statement = self.is_let() || self.is_assignment();
            value = Some(self.parse_statement()?);
            self.skip_spaces();
            match self.peek() {
                Some(b';') => {
                    self.pos += 1;
                }
                Some(c) if c == close => {
                    if as_expression && last_was_statement {
                        self.pos += 1;
                        return Err(Error::BlockMustEndWithExpression {
                            offset: self.pos - 1,
                        });
                    }
                    if as_expression {
                        self.pos = saved;
                        value = Some(self.parse_or(as_expression)?);
                    }
                    self.pos += 1;
                    return Ok(value.unwrap());
                }
                _ => {
                    return Err(Error::ExpectedClosingDelimiter {
                        offset: self.pos,
                        expected: close,
                    });
                }
            }
        }
    }

    /// Whether the next statement is a `let` binding.
    fn is_let(&self) -> bool {
        self.peek() == Some(b'l')
            && (self.input[self.pos..].starts_with("let ")
                || self.input[self.pos..].starts_with("let mut "))
    }

    /// Whether the next statement is an assignment: an identifier
    /// followed by `=`.
    fn is_assignment(&mut self) -> bool {
        if !matches!(self.peek(), Some(b'a'..=b'z')) {
            return false;
        }
        let start = self.pos;
        while matches!(self.peek(), Some(b'a'..=b'z')) {
            self.pos += 1;
        }
        self.skip_spaces();
        // A single `=` starts an assignment; `==` is the equality
        // operator, not an assignment.
        let is_assignment =
            self.peek() == Some(b'=') && self.input.as_bytes().get(self.pos + 1) != Some(&b'=');
        self.pos = start;
        is_assignment
    }

    /// Parses a statement: `let [mut] name = expr`, `name = expr`, or
    /// an expression.
    fn parse_statement(&mut self) -> Result<Value, Error> {
        self.skip_spaces();
        if self.is_let() {
            return self.parse_let();
        }
        if self.is_assignment() {
            return self.parse_assignment();
        }
        self.parse_or(false)
    }

    /// Parses `let [mut] name = expr`, consuming the `let` keyword.
    /// The binding is recorded in the current scope; the statement
    /// itself evaluates to `0`.
    fn parse_let(&mut self) -> Result<Value, Error> {
        self.pos += 4; // skip `let`
        self.skip_spaces();
        let mut mutable = false;
        if self.input[self.pos..].starts_with("mut ") {
            mutable = true;
            self.pos += 4; // skip `mut `
        }
        let (name, _, _, value) = self.parse_name_equals_expr()?;
        self.env.last_mut().unwrap().push((name, mutable, value));
        Ok(Value::Int(0))
    }

    /// Parses `name = expr`, returning the name, its offset, the
    /// offset of the right-hand side, and the value of the right-hand
    /// side.
    fn parse_name_equals_expr(&mut self) -> Result<(String, usize, usize, Value), Error> {
        let (name, offset) = self.parse_identifier_name()?;
        self.skip_spaces();
        if self.peek() != Some(b'=') {
            return Err(Error::ExpectedEquals { offset: self.pos });
        }
        self.pos += 1;
        self.skip_spaces();
        let value_offset = self.pos;
        let value = self.parse_or(true)?;
        Ok((name, offset, value_offset, value))
    }

    /// Parses `name = expr`: the right-hand side is evaluated and the
    /// binding is updated; the statement evaluates to the assigned
    /// value. Only bindings declared `mut` may be assigned.
    fn parse_assignment(&mut self) -> Result<Value, Error> {
        let (name, offset, value_offset, value) = self.parse_name_equals_expr()?;
        for scope in self.env.iter_mut().rev() {
            if let Some((_, mutable, stored)) = scope.iter_mut().find(|(n, _, _)| *n == name) {
                if !*mutable {
                    return Err(Error::AssignmentToImmutable { offset, name });
                }
                if stored.kind() != value.kind() {
                    return Err(Error::TypeMismatch {
                        offset: value_offset,
                        name,
                        expected: stored.kind().to_string(),
                        found: value.kind().to_string(),
                    });
                }
                *stored = value.clone();
                return Ok(value);
            }
        }
        Err(Error::UndefinedVariable { offset, name })
    }

    /// Parses an identifier and looks up its binding in the
    /// environment, innermost scope first.
    fn parse_identifier(&mut self) -> Result<Value, Error> {
        let (name, offset) = self.parse_identifier_name()?;
        for scope in self.env.iter().rev() {
            if let Some((_, _, value)) = scope.iter().find(|(n, _, _)| *n == name) {
                return Ok(value.clone());
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
            return Err(Error::UnexpectedToken {
                offset: start,
                found: self.peek(),
            });
        }
        Ok((self.input[start..self.pos].to_string(), start))
    }

    /// Parses a non-negative integer literal starting at the current
    /// position, reporting overflow if it does not fit in an `i64`.
    fn parse_number(&mut self) -> Result<Value, Error> {
        let start = self.pos;
        while matches!(self.peek(), Some(b'0'..=b'9')) {
            self.pos += 1;
        }
        self.input[start..self.pos]
            .parse::<i64>()
            .map(Value::Int)
            .map_err(|_| Error::Overflow { offset: start })
    }

    /// Parses `expr close` after the opening delimiter was consumed;
    /// `close` is the expected matching closing delimiter.
    fn parse_grouped(&mut self, close: u8, as_expression: bool) -> Result<Value, Error> {
        let value = self.parse_or(as_expression)?;
        self.skip_spaces();
        match self.peek() {
            Some(c) if c == close => {
                self.pos += 1;
                Ok(value)
            }
            _ => Err(Error::ExpectedClosingDelimiter {
                offset: self.pos,
                expected: close,
            }),
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
    use crate::{Error, interpret};

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
    fn top_level_let_binding() {
        assert_eq!(interpret("let y = { let x = 2 + 3; x } * 4; y"), Ok(20));
    }

    #[test]
    fn let_statement_evaluates_to_zero() {
        assert_eq!(interpret("let x = 100;"), Ok(0));
    }

    #[test]
    fn block_must_end_with_expression() {
        // The inner block ends with a `let` statement, not an
        // expression; the closing `}` is at offset 23.
        assert_eq!(
            interpret("let x = { let y = 100; }; x"),
            Err(Error::BlockMustEndWithExpression { offset: 23 })
        );
    }

    #[test]
    fn block_must_end_with_expression_not_assignment() {
        // The inner block ends with an assignment statement, not an
        // expression; the closing `}` is at offset 34.
        assert_eq!(
            interpret("let mut x = 0; let y = { x = 100; };"),
            Err(Error::BlockMustEndWithExpression { offset: 34 })
        );
    }

    #[test]
    fn if_expression_takes_else_branch_when_condition_is_false() {
        assert_eq!(interpret("let x = if (false) 2 else 3; x"), Ok(3));
    }

    #[test]
    fn if_expression_branches_can_be_blocks() {
        assert_eq!(
            interpret("let x = if (false) { let y = 2; y } else { let y = 3; y }; x"),
            Ok(3)
        );
    }

    #[test]
    fn assignment_of_different_kind_is_reported() {
        // `1` starts at offset 22; `x` holds a boolean.
        assert_eq!(
            interpret("let mut x = true; x = 1;"),
            Err(Error::TypeMismatch {
                offset: 22,
                name: "x".to_string(),
                expected: "boolean".to_string(),
                found: "integer".to_string(),
            })
        );
    }

    #[test]
    fn array_literal_and_index_access() {
        assert_eq!(
            interpret("let array = [1, 2, 3]; array[0] + array[1] + array[2]"),
            Ok(6)
        );
    }

    #[test]
    fn tuple_literal_and_field_access() {
        assert_eq!(interpret("let tuple = (3, 4); tuple.0 + tuple.1"), Ok(7));
    }

    #[test]
    fn tuple_field_out_of_bounds_is_reported() {
        assert_eq!(
            interpret("let tuple = (0, 0); tuple.2"),
            Err(Error::IndexOutOfBounds { offset: 25 })
        );
    }

    #[test]
    fn reference_and_dereference() {
        assert_eq!(interpret("let x = 1; let y = &x; *y"), Ok(1));
    }

    #[test]
    fn field_access_on_non_tuple_is_reported() {
        // `(0)` has no comma, so it is a grouped expression: `tuple`
        // is the integer 0, and `tuple.1` is not a tuple field.
        assert_eq!(
            interpret("let tuple = (0); if (false) let x = tuple.1;"),
            Err(Error::NotATuple { offset: 41 })
        );
    }

    #[test]
    fn if_statement_branches_may_be_blocks_ending_in_assignments() {
        // As a statement, the branches are statements, so the blocks
        // may end in assignments; the chosen (else) branch assigns 2.
        assert_eq!(
            interpret("let mut x = 0; if (false) { x = 1; } else { x = 2; } x"),
            Ok(2)
        );
    }

    #[test]
    fn unchosen_if_branch_side_effects_do_not_persist() {
        // The then-branch assigns to `x`, but the condition is false,
        // so `x` keeps its original value.
        assert_eq!(
            interpret("let mut x = 0; let y = if (false) { x = 1; 2 } else 3; x"),
            Ok(0)
        );
    }

    #[test]
    fn type_mismatch_in_if_branch_is_reported() {
        // `1` starts at offset 43; `a` holds a boolean.
        assert_eq!(
            interpret("let x = if (false) { let mut a = true; a = 1; a } else { let y = 3; y }; x"),
            Err(Error::TypeMismatch {
                offset: 43,
                name: "a".to_string(),
                expected: "boolean".to_string(),
                found: "integer".to_string(),
            })
        );
    }

    #[test]
    fn nested_block_must_end_with_expression_not_assignment() {
        // The inner block ends with an assignment statement, not an
        // expression; its closing `}` is at offset 36.
        assert_eq!(
            interpret("let mut x = 0; let y = { { x = 100; } };"),
            Err(Error::BlockMustEndWithExpression { offset: 36 })
        );
    }

    #[test]
    fn boolean_literal_true_is_one() {
        assert_eq!(interpret("let x = true; x"), Ok(1));
    }

    #[test]
    fn or_of_booleans() {
        assert_eq!(interpret("let x = true; let y = false; x || y"), Ok(1));
    }

    #[test]
    fn equality_of_unequal_values() {
        assert_eq!(interpret("let x = 1; let y = 2; x == y"), Ok(0));
    }

    #[test]
    fn boolean_is_not_equal_to_integer() {
        assert_eq!(interpret("true == 1"), Ok(0));
    }

    #[test]
    fn mutable_binding_assignment() {
        assert_eq!(interpret("let mut x = 0; x = 1; x"), Ok(1));
    }

    #[test]
    fn mutable_binding_assignment_in_block() {
        assert_eq!(interpret("{ let mut x = 0; x = 1; x }"), Ok(1));
    }

    #[test]
    fn assignment_to_immutable_binding_is_reported() {
        assert_eq!(
            interpret("let x = 0; x = 1; x"),
            Err(Error::AssignmentToImmutable {
                offset: 11,
                name: "x".to_string()
            })
        );
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
        assert_eq!(
            interpret("@"),
            Err(Error::UnexpectedToken {
                offset: 0,
                found: Some(b'@')
            })
        );
    }

    #[test]
    fn unsupported_syntax_reports_true_offset() {
        assert_eq!(
            interpret("1 + @"),
            Err(Error::UnexpectedToken {
                offset: 4,
                found: Some(b'@')
            })
        );
    }

    #[test]
    fn undefined_variable_is_reported() {
        assert_eq!(
            interpret("x"),
            Err(Error::UndefinedVariable {
                offset: 0,
                name: "x".into()
            })
        );
    }
}
