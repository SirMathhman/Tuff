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
/// its value; a chain of single digits joined by `+` (optional
/// surrounding spaces) is their sum; anything else is not yet supported.
pub fn interpret(input: &str) -> Result<i64, Error> {
    if input.is_empty() {
        return Ok(0);
    }
    let mut total = 0;
    let mut base = 0;
    for part in input.split('+') {
        total += parse_digit(part, base)?;
        base += part.len() + 1; // part plus the `+` that follows it
    }
    Ok(total)
}

/// Parses a single ASCII digit, or reports unsupported syntax at the
/// first non-whitespace character of `part` (offsets relative to the
/// original input via `base`).
fn parse_digit(part: &str, base: usize) -> Result<i64, Error> {
    match part.trim() {
        digit if digit.len() == 1 && digit.chars().next().unwrap().is_ascii_digit() => {
            Ok((digit.as_bytes()[0] - b'0') as i64)
        }
        _ => Err(Error::UnsupportedSyntax {
            offset: base + part.len() - part.trim_start().len(),
        }),
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
