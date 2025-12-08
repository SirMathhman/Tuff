pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

pub fn interpret(s: &str) -> String {
    s.to_string()
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
    fn interpret_returns_same_string() {
        let input = "hello world";
        assert_eq!(interpret(input), input);
    }

    #[test]
    fn interpret_handles_unicode() {
        let input = "こんにちは";
        assert_eq!(interpret(input), input);
    }
}
