pub fn evaluate(input: &str) -> Result<i64, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }
    trimmed
        .split('+')
        .map(|part| {
            part.trim()
                .parse::<i64>()
                .map_err(|_| format!("failed to parse '{}' as an integer: expected a whole number", part.trim()))
        })
        .collect::<Result<Vec<i64>, _>>()
        .map(|parts| parts.iter().sum())
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
    fn test_evaluate_invalid_input() {
        assert!(evaluate("1 + x").is_err());
    }
}
