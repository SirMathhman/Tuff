pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

pub fn interpret(s: &str) -> Result<String, &'static str> {
    let _ = s;
    Err("interpret is stubbed to return an error")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_positive() {
        assert_eq!(add(2, 3), 5);
    }

    #[test]
    fn adds_negative() {
        assert_eq!(add(-2, 3), 1);
    }

    #[test]
    fn interpret_returns_error() {
        let input = "hello world";
        assert!(interpret(input).is_err());
    }

    #[test]
    fn interpret_handles_unicode_error() {
        let input = "こんにちは";
        assert!(interpret(input).is_err());
    }
}
