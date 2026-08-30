use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    InvalidNumber { span: Span, text: String },
    UnexpectedChar { span: Span, ch: char },
    UnexpectedToken { span: Span, token: String },
    UnexpectedEnd { span: Span },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::InvalidNumber { span, text } => {
                write!(
                    f,
                    "at {}..{}: '{}' is not a valid number — expected digits (e.g. 42)",
                    span.start, span.end, text
                )
            }
            Error::UnexpectedChar { span, ch } => {
                write!(
                    f,
                    "at {}..{}: unexpected character '{}' — expected a digit, '+', '-', '*', or a parenthesis",
                    span.start, span.end, ch
                )
            }
            Error::UnexpectedToken { span, token } => {
                write!(
                    f,
                    "at {}..{}: unexpected '{}' — expected a number or '(', or a matching ')'",
                    span.start, span.end, token
                )
            }
            Error::UnexpectedEnd { span } => {
                write!(
                    f,
                    "at {}..{}: unexpected end of input — expected a number or '(', or a matching ')'",
                    span.start, span.end
                )
            }
        }
    }
}

impl std::error::Error for Error {}
