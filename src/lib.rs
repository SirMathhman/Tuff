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
/// than `+`/`-`; anything else is not yet supported.
pub fn interpret(input: &str) -> Result<i64, Error> {
    if input.is_empty() {
        return Ok(0);
    }
    let mut total = 0;
    let mut sign = 1;
    let mut base = 0;
    loop {
        while base < input.len() && input.as_bytes()[base] == b' ' {
            base += 1;
        }
        // Parse a product term: digit (* digit)*
        let mut term = parse_digit(&input[base..], base)?;
        base += 1; // skip the digit
        loop {
            while base < input.len() && input.as_bytes()[base] == b' ' {
                base += 1;
            }
            if base < input.len() && input.as_bytes()[base] == b'*' {
                base += 1;
                while base < input.len() && input.as_bytes()[base] == b' ' {
                    base += 1;
                }
                term *= parse_digit(&input[base..], base)?;
                base += 1; // skip the digit
            } else {
                break;
            }
        }
        total += sign * term;
        while base < input.len() && input.as_bytes()[base] == b' ' {
            base += 1;
        }
        if base >= input.len() {
            break;
        }
        match input.as_bytes()[base] {
            b'+' => sign = 1,
            b'-' => sign = -1,
            _ => return Err(Error::UnsupportedSyntax { offset: base }),
        }
        base += 1;
    }
    Ok(total)
}

/// Parses the first character of `rest` as a single ASCII digit, or
/// reports unsupported syntax at that character (offsets relative to
/// the original input via `base`).
fn parse_digit(rest: &str, base: usize) -> Result<i64, Error> {
    match rest.chars().next() {
        Some(digit) if digit.is_ascii_digit() => Ok((digit as u8 - b'0') as i64),
        _ => Err(Error::UnsupportedSyntax { offset: base }),
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
