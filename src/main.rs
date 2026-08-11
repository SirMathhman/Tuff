fn main() {
    println!("Hello, world!");
}

#[allow(dead_code)]
fn evaluate(input: &str) -> i64 {
    if input.is_empty() {
        0
    } else {
        input.parse().unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evaluate_empty_string() {
        assert_eq!(evaluate(""), 0);
    }

    #[test]
    fn test_evaluate_one() {
        assert_eq!(evaluate("1"), 1);
    }
}
