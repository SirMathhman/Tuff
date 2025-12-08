// try_eval_addition helper removed — interpret handles expressions inline

// (doc comments moved closer to the public function)

fn split_leading_number(s: &str) -> (String, String, bool, bool) {
    let mut chars = s.chars().peekable();
    let mut out = String::new();

    let mut negative = false;
    if let Some(&c) = chars.peek() {
        if c == '+' || c == '-' {
            if c == '-' {
                negative = true;
            }
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

fn validate_unsigned(digits_str: &str, suf: &str) -> Result<(), String> {
    let digits = digits_str.trim_start_matches('+');
    let v = digits.parse::<u128>().map_err(|_| {
        format!(
            "numeric literal out of range for {}",
            suf.to_ascii_uppercase()
        )
    })?;
    match suf {
        "u8" => {
            if v <= 255 {
                Ok(())
            } else {
                Err("numeric literal out of range for U8".to_string())
            }
        }
        "u16" => {
            if v <= 65535 {
                Ok(())
            } else {
                Err("numeric literal out of range for U16".to_string())
            }
        }
        "u32" => {
            if v <= 4294967295 {
                Ok(())
            } else {
                Err("numeric literal out of range for U32".to_string())
            }
        }
        "u64" => {
            if v <= 18446744073709551615u128 {
                Ok(())
            } else {
                Err("numeric literal out of range for U64".to_string())
            }
        }
        _ => Ok(()),
    }
}

fn validate_signed(out: &str, suf: &str) -> Result<(), String> {
    let v = out.parse::<i128>().map_err(|_| {
        format!(
            "numeric literal out of range for {}",
            suf.to_ascii_uppercase()
        )
    })?;
    match suf {
        "i8" => {
            if (-128..=127).contains(&v) {
                Ok(())
            } else {
                Err("numeric literal out of range for I8".to_string())
            }
        }
        "i16" => {
            if (-32768..=32767).contains(&v) {
                Ok(())
            } else {
                Err("numeric literal out of range for I16".to_string())
            }
        }
        "i32" => {
            if (-2147483648..=2147483647).contains(&v) {
                Ok(())
            } else {
                Err("numeric literal out of range for I32".to_string())
            }
        }
        "i64" => {
            if (-9223372036854775808..=9223372036854775807).contains(&v) {
                Ok(())
            } else {
                Err("numeric literal out of range for I64".to_string())
            }
        }
        _ => Ok(()),
    }
}

fn try_eval_addition(s: &str) -> Option<Result<String, String>> {
    if let Some(pos) = s.find('+') {
        if pos > 0
            && s[..pos].chars().any(|c| c.is_ascii_digit())
            && s[pos + 1..].chars().any(|c| c.is_ascii_digit())
        {
            let left = s[..pos].trim();
            let right = s[pos + 1..].trim();

            let (l_num, l_rem, l_neg, l_found) = split_leading_number(left);
            let (r_num, r_rem, r_neg, r_found) = split_leading_number(right);
            if !l_found || !r_found {
                return Some(Err("invalid operands".to_string()));
            }
            if !(l_rem.eq_ignore_ascii_case(&r_rem) || (l_rem.is_empty() && r_rem.is_empty())) {
                return Some(Err("mismatched operand types".to_string()));
            }

            let suf = l_rem.to_ascii_lowercase();

            // Evaluate similar to the inline logic; return Some(result) if matched
            // Parse and check ranges without using the `?` operator here so we can
            // return Option<Result<..>> cleanly.
            // helpers to parse pairs
            fn parse_signed_pair(a: &str, b: &str) -> Result<(i128, i128), String> {
                let a = a
                    .parse::<i128>()
                    .map_err(|_| "invalid integer".to_string())?;
                let b = b
                    .parse::<i128>()
                    .map_err(|_| "invalid integer".to_string())?;
                Ok((a, b))
            }

            fn parse_unsigned_pair(a: &str, b: &str) -> Result<(u128, u128), String> {
                let a = a
                    .trim_start_matches('+')
                    .parse::<u128>()
                    .map_err(|_| "invalid integer".to_string())?;
                let b = b
                    .trim_start_matches('+')
                    .parse::<u128>()
                    .map_err(|_| "invalid integer".to_string())?;
                Ok((a, b))
            }

            if suf.is_empty() {
                let (a, b) = match parse_signed_pair(&l_num, &r_num) {
                    Ok(v) => v,
                    Err(e) => return Some(Err(e)),
                };
                return Some(Ok((a + b).to_string()));
            }

            if suf.starts_with('u') {
                fn add_and_check_unsigned(
                    a_str: &str,
                    b_str: &str,
                    suf: &str,
                    negative: bool,
                ) -> Result<String, String> {
                    if negative {
                        return Err(
                            "negative numeric literal with suffix not supported".to_string()
                        );
                    }
                    let (a, b) = parse_unsigned_pair(a_str, b_str)?;
                    let sum = a.checked_add(b).ok_or_else(|| "overflow".to_string())?;
                    match suf {
                        "u8" => {
                            if sum <= 255 {
                                Ok(sum.to_string())
                            } else {
                                Err("numeric literal out of range for U8".to_string())
                            }
                        }
                        "u16" => {
                            if sum <= 65535 {
                                Ok(sum.to_string())
                            } else {
                                Err("numeric literal out of range for U16".to_string())
                            }
                        }
                        "u32" => {
                            if sum <= 4294967295 {
                                Ok(sum.to_string())
                            } else {
                                Err("numeric literal out of range for U32".to_string())
                            }
                        }
                        "u64" => {
                            if sum <= 18446744073709551615u128 {
                                Ok(sum.to_string())
                            } else {
                                Err("numeric literal out of range for U64".to_string())
                            }
                        }
                        _ => Err("unsupported unsigned suffix".to_string()),
                    }
                }

                return Some(add_and_check_unsigned(&l_num, &r_num, &suf, l_neg || r_neg));
            }

            if suf.starts_with('i') {
                fn add_and_check_signed(
                    a_str: &str,
                    b_str: &str,
                    suf: &str,
                ) -> Result<String, String> {
                    let (a, b) = parse_signed_pair(a_str, b_str)?;
                    let sum = a.checked_add(b).ok_or_else(|| "overflow".to_string())?;
                    match suf {
                        "i8" => {
                            if (-128..=127).contains(&sum) {
                                Ok(sum.to_string())
                            } else {
                                Err("numeric literal out of range for I8".to_string())
                            }
                        }
                        "i16" => {
                            if (-32768..=32767).contains(&sum) {
                                Ok(sum.to_string())
                            } else {
                                Err("numeric literal out of range for I16".to_string())
                            }
                        }
                        "i32" => {
                            if (-2147483648..=2147483647).contains(&sum) {
                                Ok(sum.to_string())
                            } else {
                                Err("numeric literal out of range for I32".to_string())
                            }
                        }
                        "i64" => {
                            if (-9223372036854775808..=9223372036854775807).contains(&sum) {
                                Ok(sum.to_string())
                            } else {
                                Err("numeric literal out of range for I64".to_string())
                            }
                        }
                        _ => Err("unsupported signed suffix".to_string()),
                    }
                }

                return Some(add_and_check_signed(&l_num, &r_num, &suf));
            }

            return Some(Err("unsupported suffix for expression".to_string()));
        }
    }
    None
}

/// Interpret the given input string and return a resulting string.
///
/// Currently this function is a stub and always returns an `Err` indicating
/// it is not yet implemented.
pub fn interpret(input: &str) -> Result<String, String> {
    let s = input.trim();

    // expression handling occurs inline below

    // evaluate expression first (if present)
    if let Some(res) = try_eval_addition(s) {
        return res;
    }

    // use module-level helpers
    let (out, remaining, negative, found_digit) = split_leading_number(s);

    if found_digit {
        if !remaining.is_empty() {
            // negative numbers with suffix are not allowed for unsigned types
            // but are allowed for signed types (with range check).
            // use module-level validation helpers

            let suf = remaining.to_ascii_lowercase();
            match suf.as_str() {
                "u8" | "u16" | "u32" | "u64" => {
                    if negative {
                        return Err(
                            "negative numeric literal with suffix not supported".to_string()
                        );
                    }
                    validate_unsigned(&out, suf.as_str())?;
                }
                "i8" | "i16" | "i32" | "i64" => {
                    validate_signed(&out, suf.as_str())?;
                }
                _ => {}
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

    #[test]
    fn interpret_u16_bounds() {
        assert_eq!(interpret("65535U16").unwrap(), "65535");
        assert!(interpret("65536U16").is_err());
    }

    #[test]
    fn interpret_u32_bounds() {
        assert_eq!(interpret("4294967295U32").unwrap(), "4294967295");
        assert!(interpret("4294967296U32").is_err());
    }

    #[test]
    fn interpret_u64_bounds() {
        assert_eq!(
            interpret("18446744073709551615U64").unwrap(),
            "18446744073709551615"
        );
        assert!(interpret("18446744073709551616U64").is_err());
    }

    #[test]
    fn interpret_i8_bounds() {
        assert_eq!(interpret("127I8").unwrap(), "127");
        assert!(interpret("128I8").is_err());
        assert_eq!(interpret("-128I8").unwrap(), "-128");
        assert!(interpret("-129I8").is_err());
    }

    #[test]
    fn interpret_add_u8() {
        let res = interpret("100U8 + 50U8");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "150");
    }

    #[test]
    fn interpret_add_u8_overflow() {
        assert!(interpret("200U8 + 100U8").is_err());
    }

    #[test]
    fn interpret_rejects_mismatched_suffixes_in_expression() {
        assert!(interpret("100U8 + 50U16").is_err());
    }
}
