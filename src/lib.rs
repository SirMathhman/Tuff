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

    // validate based on suffix (support U/I with widths 8,16,32,64)
    let suffix = &s[idx..];
    let mut suffix_chars = suffix.chars();
    let kind = suffix_chars.next().unwrap_or('\0');
    let width_str: String = suffix_chars.take_while(|c| c.is_ascii_digit()).collect();
    if width_str.is_empty() {
        return Err("unsupported or missing width in suffix");
    }

    let width: u32 = width_str.parse().map_err(|_| "invalid width in suffix")?;

    match kind {
        'U' | 'u' => {
            // unsigned: parse digits as u128 and compare to max
            let val = digits.parse::<u128>().map_err(|_| "failed to parse numeric value")?;
            let max = match width {
                8 => u128::from(u8::MAX),
                16 => u128::from(u16::MAX),
                32 => u128::from(u32::MAX),
                64 => u128::from(u64::MAX),
                _ => return Err("unsupported unsigned width"),
            };
            if val > max {
                return Err("value out of range for unsigned type");
            }
        }
        'I' | 'i' => {
            // signed: convert digits to i128 applying sign and ensure it's in range
            let unsigned = digits.parse::<u128>().map_err(|_| "failed to parse numeric value")?;
            // apply sign
            let signed_val = if let Some('-') = sign {
                let v = -(unsigned as i128);
                v
            } else {
                unsigned as i128
            };

            let (min, max) = match width {
                8 => (i128::from(i8::MIN), i128::from(i8::MAX)),
                16 => (i128::from(i16::MIN), i128::from(i16::MAX)),
                32 => (i128::from(i32::MIN), i128::from(i32::MAX)),
                64 => (i128::from(i64::MIN), i128::from(i64::MAX)),
                _ => return Err("unsupported signed width"),
            };

            if signed_val < min || signed_val > max {
                return Err("value out of range for signed type");
            }
        }
        _ => return Err("unsupported suffix kind"),
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

    #[test]
    fn interpret_allows_u16_boundaries() {
        assert_eq!(interpret("65535U16").unwrap(), "65535");
        assert!(interpret("65536U16").is_err());
    }

    #[test]
    fn interpret_allows_u32_boundaries() {
        assert_eq!(interpret("4294967295U32").unwrap(), "4294967295");
        assert!(interpret("4294967296U32").is_err());
    }

    #[test]
    fn interpret_allows_u64_boundaries() {
        assert_eq!(interpret("18446744073709551615U64").unwrap(), "18446744073709551615");
        assert!(interpret("18446744073709551616U64").is_err());
    }

    #[test]
    fn interpret_signed_i16_boundaries() {
        assert_eq!(interpret("32767I16").unwrap(), "32767");
        assert_eq!(interpret("-32768I16").unwrap(), "-32768");
        assert!(interpret("32768I16").is_err());
        assert!(interpret("-32769I16").is_err());
    }

    #[test]
    fn interpret_signed_i32_boundaries() {
        assert_eq!(interpret("2147483647I32").unwrap(), "2147483647");
        assert_eq!(interpret("-2147483648I32").unwrap(), "-2147483648");
        assert!(interpret("2147483648I32").is_err());
        assert!(interpret("-2147483649I32").is_err());
    }

    #[test]
    fn interpret_signed_i64_boundaries() {
        assert_eq!(interpret("9223372036854775807I64").unwrap(), "9223372036854775807");
        assert_eq!(interpret("-9223372036854775808I64").unwrap(), "-9223372036854775808");
        assert!(interpret("9223372036854775808I64").is_err());
        assert!(interpret("-9223372036854775809I64").is_err());
    }
}
