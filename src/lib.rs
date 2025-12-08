pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

pub fn interpret(s: &str) -> Result<String, &'static str> {
    let mut digits = String::new();
    for c in s.chars() {
        if c.is_ascii_digit() {
            digits.push(c);
        } else {
            break;
        }
    }

    if digits.is_empty() {
        return Err("no leading digits to interpret");
    }

    // require a non-empty suffix (we only interpret values like "100U8")
    if digits.len() == s.len() {
        return Err("no type suffix present");
    }

    Ok(digits)
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

    #[test]
    fn interpret_parses_numeric_prefix_with_suffix() {
        let input = "100U8";
        assert_eq!(interpret(input).unwrap(), "100");
    }
}
