mod errors;
pub use errors::Error;

pub fn evaluate(input: &str) -> Result<i64, Error> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }
    let chars: Vec<char> = trimmed.chars().collect();
    let mut pos = 0;
    let mut total: i64 = 0;
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
            && (pending_op.is_none() || pending_op == Some('+') || pending_op == Some('-'))
        {
            num_str.push('-');
            pos += 1;
        }
        while pos < chars.len() && chars[pos].is_ascii_digit() {
            num_str.push(chars[pos]);
            pos += 1;
        }
        if num_str.is_empty() || num_str == "-" {
            return Err(Error::Parse {
                span: errors::Span { start, end: pos },
                text: num_str,
                message: "not a whole number".to_string(),
            });
        }
        let val: i64 = num_str.parse().map_err(|_| Error::Parse {
            span: errors::Span { start, end: pos },
            text: num_str,
            message: "not a whole number".to_string(),
        })?;
        let op = pending_op.unwrap_or('+');
        total = match op {
            '+' => total + val,
            '-' => total - val,
            _ => unreachable!(),
        };

        // Skip whitespace
        while pos < chars.len() && chars[pos].is_whitespace() {
            pos += 1;
        }
        if pos >= chars.len() {
            break;
        }

        // Expect an operator
        if chars[pos] == '+' || chars[pos] == '-' {
            pending_op = Some(chars[pos]);
            pos += 1;
        } else {
            return Err(Error::Parse {
                span: errors::Span {
                    start: pos,
                    end: pos + 1,
                },
                text: chars[pos].to_string(),
                message: "unexpected character".to_string(),
            });
        }
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
    fn test_evaluate_invalid_input() {
        assert!(evaluate("1 + x").is_err());
    }
}
