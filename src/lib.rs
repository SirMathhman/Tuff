pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

pub fn interpret(s: &str) -> Result<String, &'static str> {
    let bytes = s.as_bytes();
    if bytes.is_empty() {
        return Err("empty input");
    }

    // parse optional sign
    let mut idx = 0usize;
    let mut sign: Option<char> = None;
    if bytes[0] == b'+' || bytes[0] == b'-' {
        sign = Some(bytes[0] as char);
        idx = 1;
    }

    let start_digits = idx;
    while idx < bytes.len() && (bytes[idx] >= b'0' && bytes[idx] <= b'9') {
        idx += 1;
    }

    if start_digits == idx {
        return Err("no leading digits to interpret");
    }

    // require a non-empty suffix (we only interpret values like "100U8" or "-100I8")
    if idx == bytes.len() {
        return Err("no type suffix present");
    }

    // decide whether negative values are allowed — only allow when suffix starts with 'I' (signed)
    if let Some('-') = sign {
        // suffix's first character
        let suffix_first = bytes[idx] as char;
        if !(suffix_first == 'I' || suffix_first == 'i') {
            return Err("negative values not allowed for unsigned suffix");
        }
    }

    let digits = &s[start_digits..idx];
    let mut out = String::new();
    if let Some(sign_char) = sign {
        if sign_char == '-' {
            out.push('-');
        }
    }
    out.push_str(digits);

    // validate unsigned 8-bit range if suffix indicates U8
    let suffix = &s[idx..];
    if suffix.len() >= 2 {
        // simple check for U8 (case-insensitive)
        if (suffix.as_bytes()[0] == b'U' || suffix.as_bytes()[0] == b'u') && suffix.contains('8') {
            // parse digits as u128 and ensure it's <= 255
            if let Ok(val) = digits.parse::<u128>() {
                if val > 255 {
                    return Err("value out of range for U8");
                }
            } else {
                return Err("failed to parse numeric value");
            }
        }
    }

    Ok(out)
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

    #[test]
    fn interpret_rejects_negative_numeric_prefix() {
        let input = "-100U8";
        assert!(interpret(input).is_err());
    }

    #[test]
    fn interpret_allows_negative_with_signed_suffix() {
        let input = "-100I8";
        assert_eq!(interpret(input).unwrap(), "-100");
    }

    #[test]
    fn interpret_rejects_out_of_range_u8() {
        let input = "256U8";
        assert!(interpret(input).is_err());
    }
}
