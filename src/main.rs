fn main() {
    println!("Hello, world!");
}

#[allow(dead_code)]
fn evaluate(_input: &str) -> i64 {
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evaluate_empty_string() {
        assert_eq!(evaluate(""), 0);
    }
}
