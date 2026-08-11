fn main() {
    println!("Hello, world!");
}

#[allow(dead_code)]
fn evaluate(input: &str) -> i64 {
    if input.is_empty() {
        return 0;
    }
    let parts: Vec<&str> = input.split(" + ").collect();
    parts.iter().map(|p| p.trim().parse::<i64>().unwrap_or(0)).sum()
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

    #[test]
    fn test_evaluate_addition() {
        assert_eq!(evaluate("1 + 2"), 3);
    }

    #[test]
    fn test_evaluate_chained_addition() {
        assert_eq!(evaluate("1 + 2 + 3"), 6);
    }
}
