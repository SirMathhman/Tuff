use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    InvalidNumber { span: Span, text: String },
    UnexpectedChar { span: Span, ch: char },
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
                    "at {}..{}: unexpected character '{}' — expected a digit, '+', or '-'",
                    span.start, span.end, ch
                )
            }
        }
    }
}

impl std::error::Error for Error {}
