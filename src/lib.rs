mod errors;
pub use errors::Error;

pub fn evaluate(input: &str) -> Result<i64, Error> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }
    let mut offset = 0;
    let mut total: i64 = 0;
    for part in trimmed.split('+') {
        let leading_ws = part.len() - part.trim_start().len();
        let part_trimmed = part.trim();
        let start = offset + leading_ws;
        let end = start + part_trimmed.len();
        match part_trimmed.parse::<i64>() {
            Ok(val) => total += val,
            Err(_) => {
                return Err(Error::Parse {
                    span: errors::Span { start, end },
                    text: part_trimmed.to_string(),
                    message: "not a whole number".to_string(),
                })
            }
        }
        offset += part.len() + 1;
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
    fn test_evaluate_invalid_input() {
        assert!(evaluate("1 + x").is_err());
    }
}
