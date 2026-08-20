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
            Error::UnsupportedSyntax { offset } => write!(
                f,
                "unsupported syntax at offset {offset}: expected an integer literal \
                 (digits, optionally with a leading '-'); remove or fix the offending character"
            ),
        }
    }
}

impl std::error::Error for Error {}

/// Interprets `input` and returns its value.
///
/// The bare minimum for now: an empty string is `0`; otherwise the input
/// must be a single integer literal.
pub fn interpret(input: &str) -> Result<i64, Error> {
    if input.is_empty() {
        Ok(0)
    } else {
        input.parse::<i64>().map_err(|_| {
            Error::UnsupportedSyntax {
                offset: first_bad_offset(input),
            }
        })
    }
}

/// Offset of the first character that cannot be part of an integer
/// literal, or the end of the input if every character could be.
fn first_bad_offset(input: &str) -> usize {
    input
        .char_indices()
        .find(|(i, c)| !c.is_ascii_digit() && !(*c == '-' && *i == 0))
        .map_or(input.len(), |(i, _)| i)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string_is_zero() {
        assert_eq!(interpret(""), Ok(0));
    }

    #[test]
    fn integer_literal() {
        assert_eq!(interpret("1"), Ok(1));
    }

    // Coverage test: non-empty input must yield Err, not panic.
    #[test]
    fn non_empty_input_is_unsupported() {
        assert_eq!(interpret("x"), Err(Error::UnsupportedSyntax { offset: 0 }));
    }

    #[test]
    fn error_offset_points_at_offending_character() {
        assert_eq!(
            interpret("12x"),
            Err(Error::UnsupportedSyntax { offset: 2 })
        );
        assert_eq!(
            interpret("abc"),
            Err(Error::UnsupportedSyntax { offset: 0 })
        );
        assert_eq!(
            interpret("12 34"),
            Err(Error::UnsupportedSyntax { offset: 2 })
        );
        assert_eq!(
            interpret("-"),
            Err(Error::UnsupportedSyntax { offset: 1 })
        );
    }
}
