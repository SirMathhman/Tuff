/// Interpret the given input string and return a resulting string.
///
/// Currently this function is a stub and always returns an `Err` indicating
/// it is not yet implemented.
pub fn interpret(input: &str) -> Result<String, String> {
    let s = input.trim();

    // Parse an optional sign followed by leading digits. If there are leading
    // digits, return just that numeric part. This handles literals like
    // "100" and "100U8" (returns "100").
    let mut chars = s.chars().peekable();
    let mut out = String::new();

    let mut negative = false;
    if let Some(&c) = chars.peek() {
        if c == '+' || c == '-' {
            if c == '-' { negative = true; }
            out.push(c);
            chars.next();
        }
    }

    // collect leading digits
    let mut found_digit = false;
    while let Some(&c) = chars.peek() {
        if c.is_ascii_digit() {
            found_digit = true;
            out.push(c);
            chars.next();
        } else {
            break;
        }
    }

    if found_digit {
        // If there are any remaining chars after the leading digits, we
        // consider them a suffix. Negative numbers with suffixes are not
        // supported and should return an error — e.g. "-100U8" -> Err.
        if chars.peek().is_some() && negative {
            return Err("negative numeric literal with suffix not supported".to_string());
        }

        return Ok(out);
    }

    Err("interpret not implemented yet".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpret_returns_err_for_non_numeric() {
        let res = interpret("hello");
        assert!(res.is_err());
        assert_eq!(res.unwrap_err(), "interpret not implemented yet");
    }

    #[test]
    fn interpret_returns_ok_for_numeric() {
        let res = interpret("100");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "100");
    }

    #[test]
    fn interpret_strips_suffixes_like_u8() {
        let res = interpret("100U8");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "100");
    }

    #[test]
    fn interpret_rejects_negative_with_suffix() {
        let res = interpret("-100U8");
        assert!(res.is_err());
    }
}
