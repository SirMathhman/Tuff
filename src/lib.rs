mod errors;
pub use errors::Error;

pub fn evaluate(input: &str) -> Result<i64, Error> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }
    // Offset to convert trimmed-relative positions to source-relative
    let base = input.len() - input.trim_start().len();
    let chars: Vec<char> = trimmed.chars().collect();
    let mut pos = 0;
    let mut terms: Vec<(char, i64)> = Vec::new(); // (operator, value)
    let mut pending_op: Option<char> = None;

    while pos < chars.len() {
        // Skip whitespace
        while pos < chars.len() && chars[pos].is_whitespace() {
            pos += 1;
        }
        if pos >= chars.len() {
            break;
        }

        // Parse a number
        let start = pos;
        let mut num_str = String::new();
        // Optional negative sign (only at start or after an operator)
        if chars[pos] == '-'
            && (pending_op.is_none()
                || pending_op == Some('+')
                || pending_op == Some('-')
                || pending_op == Some('*'))
        {
            num_str.push('-');
            pos += 1;
        }
        while pos < chars.len() && chars[pos].is_ascii_digit() {
            num_str.push(chars[pos]);
            pos += 1;
        }
        if num_str.is_empty() {
            return Err(Error::UnexpectedChar {
                span: errors::Span {
                    start: base + start,
                    end: base + start + 1,
                },
                ch: chars[start],
            });
        }
        if num_str == "-" {
            return Err(Error::InvalidNumber {
                span: errors::Span {
                    start: base + start,
                    end: base + pos,
                },
                text: num_str,
            });
        }
        let val: i64 = num_str.parse().map_err(|_| Error::InvalidNumber {
            span: errors::Span {
                start: base + start,
                end: base + pos,
            },
            text: num_str,
        })?;
        let op = pending_op.take().unwrap_or('+');
        terms.push((op, val));

        // Skip whitespace
        while pos < chars.len() && chars[pos].is_whitespace() {
            pos += 1;
        }
        if pos >= chars.len() {
            break;
        }

        // Expect an operator
        if chars[pos] == '+' || chars[pos] == '-' || chars[pos] == '*' {
            pending_op = Some(chars[pos]);
            pos += 1;
        } else {
            return Err(Error::UnexpectedChar {
                span: errors::Span {
                    start: base + pos,
                    end: base + pos + 1,
                },
                ch: chars[pos],
            });
        }
    }

    // Two-pass evaluation: multiplication first, then addition/subtraction
    // Pass 1: fold * into terms
    let mut folded: Vec<(char, i64)> = Vec::new();
    let mut i = 0;
    while i < terms.len() {
        let (op, val) = terms[i];
        if op == '*' {
            // Multiply with previous term
            if let Some((_, prev_val)) = folded.last_mut() {
                *prev_val *= val;
            }
        } else {
            folded.push((op, val));
        }
        i += 1;
    }
    // Pass 2: fold + and -
    let mut total: i64 = 0;
    for (op, val) in &folded {
        total = match op {
            '+' => total + val,
            '-' => total - val,
            _ => unreachable!(),
        };
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evaluate_empty_string() {
        assert_eq!(evaluate(""), Ok(0));
    }

    #[test]
    fn test_evaluate_single_digit() {
        assert_eq!(evaluate("1"), Ok(1));
    }

    #[test]
    fn test_evaluate_addition() {
        assert_eq!(evaluate("1 + 2"), Ok(3));
    }

    #[test]
    fn test_evaluate_chained_addition() {
        assert_eq!(evaluate("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn test_evaluate_addition_and_subtraction() {
        assert_eq!(evaluate("2 + 3 - 4"), Ok(1));
    }

    #[test]
    fn test_evaluate_multiplication_precedence() {
        assert_eq!(evaluate("2 * 3 + 4"), Ok(10));
    }

    #[test]
    fn test_evaluate_invalid_input() {
        match evaluate("1 + x") {
            Err(Error::UnexpectedChar { span, ch }) => {
                assert_eq!(ch, 'x');
                assert_eq!(span, errors::Span { start: 4, end: 5 });
            }
            other => panic!("expected UnexpectedChar, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_span_with_leading_whitespace() {
        match evaluate("  1 + x") {
            Err(Error::UnexpectedChar { span, ch }) => {
                assert_eq!(ch, 'x');
                assert_eq!(span, errors::Span { start: 6, end: 7 });
            }
            other => panic!("expected UnexpectedChar, got {:?}", other),
        }
    }
}
