/// Interpret the given input string and return a resulting string.
///
/// Currently this function is a stub and always returns an `Err` indicating
/// it is not yet implemented.
pub fn interpret(input: &str) -> Result<String, String> {
    let s = input.trim();

    // Extract leading number (optional sign + digits) and any remaining
    // suffix string. Keep this logic in a small helper to keep cognitive
    // complexity low for the main function.
    fn split_leading_number(s: &str) -> (String, String, bool, bool) {
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

        let remaining: String = chars.collect();
        (out, remaining, negative, found_digit)
    }

    let (out, remaining, negative, found_digit) = split_leading_number(s);

    if found_digit {
        if !remaining.is_empty() {
            if negative {
                return Err("negative numeric literal with suffix not supported".to_string());
            }

            if remaining.eq_ignore_ascii_case("u8") {
                let digits = out.trim_start_matches('+');
                match digits.parse::<u128>() {
                    Ok(v) if v <= 255 => return Ok(out),
                    _ => return Err("numeric literal out of range for U8".to_string()),
                }
            }
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

    #[test]
    fn interpret_accepts_max_u8() {
        let res = interpret("255U8");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "255");
    }

    #[test]
    fn interpret_rejects_overflow_u8() {
        let res = interpret("256U8");
        assert!(res.is_err());
    }
}
