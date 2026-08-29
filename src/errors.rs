use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    Parse {
        span: Span,
        text: String,
        message: String,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Parse {
                span,
                text,
                message,
            } => {
                write!(
                    f,
                    "at {}..{}: '{}' — {} (expected a whole number)",
                    span.start, span.end, text, message
                )
            }
        }
    }
}

impl std::error::Error for Error {}
