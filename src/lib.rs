pub fn evaluate(input: &str) -> i64 {
    input
        .split('+')
        .map(|part| part.trim().parse::<i64>().unwrap_or(0))
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evaluate_empty_string() {
        assert_eq!(evaluate(""), 0);
    }

    #[test]
    fn test_evaluate_single_digit() {
        assert_eq!(evaluate("1"), 1);
    }

    #[test]
    fn test_evaluate_addition() {
        assert_eq!(evaluate("1 + 2"), 3);
    }
}
