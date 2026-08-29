fn main() {
    println!("Hello, world!");
}

fn evaluate(input: &str) -> i64 {
    input.trim().parse().unwrap_or(0)
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
}
