#![cfg_attr(coverage_nightly, feature(coverage_attribute))]

#[cfg_attr(coverage_nightly, coverage(off))]
fn main() {
    println!("Hello, world!");
}

fn interpret(source: &str) -> i64 {
    source.trim().parse::<i64>().unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string() {
        assert_eq!(interpret(""), 0);
    }

    #[test]
    fn test_whitespace_only() {
        assert_eq!(interpret(" "), 0);
    }

    #[test]
    fn test_single_digit() {
        assert_eq!(interpret("1"), 1);
    }

    #[test]
    fn test_single_digit_two() {
        assert_eq!(interpret("2"), 2);
    }
}
