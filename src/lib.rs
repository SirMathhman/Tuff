use std::fmt;

/// A span of character offsets into the input source.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

/// Errors produced while evaluating a Tuff expression.
#[derive(Debug, PartialEq, Eq)]
pub enum TuffError {
    /// The input could not be parsed at the given span.
    Parse { span: Span, message: String },
}

impl fmt::Display for TuffError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TuffError::Parse { span, message } => {
                write!(
                    f,
                    "parse error at {}..{}: {} (expected a number)",
                    span.start, span.end, message
                )
            }
        }
    }
}

/// Evaluate a Tuff expression and return its value.
pub fn evaluate(input: &str) -> Result<i64, TuffError> {
    let mut parser = Parser::new(input);
    let value = parser.parse_expr()?;
    parser.skip_whitespace();
    if let Some(c) = parser.peek() {
        return Err(TuffError::Parse {
            span: Span {
                start: parser.pos,
                end: parser.pos + 1,
            },
            message: format!("unexpected character '{c}'"),
        });
    }
    Ok(value)
}

struct Parser {
    chars: Vec<char>,
    pos: usize,
}

impl Parser {
    fn new(input: &str) -> Self {
        Self {
            chars: input.chars().collect(),
            pos: 0,
        }
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn skip_whitespace(&mut self) {
        while matches!(self.peek(), Some(c) if c.is_whitespace()) {
            self.pos += 1;
        }
    }

    fn parse_expr(&mut self) -> Result<i64, TuffError> {
        let mut value = self.parse_term()?;
        loop {
            self.skip_whitespace();
            match self.peek() {
                Some('+') => {
                    self.pos += 1;
                    value += self.parse_term()?;
                }
                Some('-') => {
                    self.pos += 1;
                    value -= self.parse_term()?;
                }
                _ => break,
            }
        }
        Ok(value)
    }

    fn parse_term(&mut self) -> Result<i64, TuffError> {
        let mut value = self.parse_number()?;
        loop {
            self.skip_whitespace();
            if self.peek() == Some('*') {
                self.pos += 1;
                value *= self.parse_number()?;
            } else {
                break;
            }
        }
        Ok(value)
    }

    fn parse_number(&mut self) -> Result<i64, TuffError> {
        self.skip_whitespace();
        let start = self.pos;
        while matches!(self.peek(), Some(c) if c.is_ascii_digit()) {
            self.pos += 1;
        }
        if start == self.pos {
            let end = (self.pos + 1).min(self.chars.len());
            return Err(TuffError::Parse {
                span: Span { start, end },
                message: "no number found".to_string(),
            });
        }
        let digits: String = self.chars[start..self.pos].iter().collect();
        digits.parse().map_err(|_| TuffError::Parse {
            span: Span {
                start,
                end: self.pos,
            },
            message: "number out of range".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string_is_a_parse_error() {
        assert_eq!(
            evaluate(""),
            Err(TuffError::Parse {
                span: Span { start: 0, end: 0 },
                message: "no number found".to_string(),
            })
        );
    }

    #[test]
    fn one_evaluates_to_one() {
        assert_eq!(evaluate("1"), Ok(1));
    }

    #[test]
    fn one_plus_two_evaluates_to_three() {
        assert_eq!(evaluate("1 + 2"), Ok(3));
    }

    #[test]
    fn one_plus_two_plus_three_evaluates_to_six() {
        assert_eq!(evaluate("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn two_plus_three_minus_four_evaluates_to_one() {
        assert_eq!(evaluate("2 + 3 - 4"), Ok(1));
    }

    #[test]
    fn two_times_three_plus_four_evaluates_to_ten() {
        assert_eq!(evaluate("2 * 3 + 4"), Ok(10));
    }

    #[test]
    fn dangling_operator_is_a_parse_error() {
        assert_eq!(
            evaluate("1 +"),
            Err(TuffError::Parse {
                span: Span { start: 3, end: 3 },
                message: "no number found".to_string(),
            })
        );
    }
}
