pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

struct ParsedValue {
    kind: char,
    width: u32,
    value_u: u128,
    value_i: i128,
    repr: String,
}

fn unsigned_max_for_width(width: u32) -> Result<u128, &'static str> {
    match width {
        8 => Ok(u128::from(u8::MAX)),
        16 => Ok(u128::from(u16::MAX)),
        32 => Ok(u128::from(u32::MAX)),
        64 => Ok(u128::from(u64::MAX)),
        _ => Err("unsupported unsigned width"),
    }
}

fn signed_range_for_width(width: u32) -> Result<(i128, i128), &'static str> {
    match width {
        8 => Ok((i128::from(i8::MIN), i128::from(i8::MAX))),
        16 => Ok((i128::from(i16::MIN), i128::from(i16::MAX))),
        32 => Ok((i128::from(i32::MIN), i128::from(i32::MAX))),
        64 => Ok((i128::from(i64::MIN), i128::from(i64::MAX))),
        _ => Err("unsupported signed width"),
    }
}

struct ParsedPrefix<'a> {
    sign: Option<char>,
    digits: &'a str,
    suffix_start: usize,
}

fn parse_sign_and_digits(s: &str) -> Result<ParsedPrefix, &'static str> {
    let bytes = s.as_bytes();
    if bytes.is_empty() {
        return Err("empty input");
    }

    let mut idx = 0usize;
    let mut sign: Option<char> = None;
    if let Some(&first) = bytes.first() {
        if first == b'+' || first == b'-' {
            sign = Some(first as char);
            idx = 1;
        }
    }

    let start_digits = idx;
    while idx < bytes.len() {
        if let Some(&byte) = bytes.get(idx) {
            if byte.is_ascii_digit() {
                idx += 1;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    if start_digits == idx {
        return Err("no leading digits to interpret");
    }

    if idx == bytes.len() {
        return Err("no type suffix present");
    }

    Ok(ParsedPrefix {
        sign,
        digits: &s[start_digits..idx],
        suffix_start: idx,
    })
}

fn parse_suffix_and_width(s: &str, suffix_start: usize) -> Result<(char, u32), &'static str> {
    let suffix = &s[suffix_start..];
    let mut suffix_chars = suffix.chars();
    let kind = suffix_chars.next().unwrap_or('\0');
    let width_str: String = suffix_chars.take_while(|c| c.is_ascii_digit()).collect();
    if width_str.is_empty() {
        return Err("unsupported or missing width in suffix");
    }
    let width: u32 = width_str.parse().map_err(|_| "invalid width in suffix")?;
    Ok((kind, width))
}

fn build_unsigned_value(
    kind: char,
    width: u32,
    digits: &str,
    sign: Option<char>,
) -> Result<ParsedValue, &'static str> {
    if let Some('-') = sign {
        return Err("negative values not allowed for unsigned suffix");
    }
    let val = digits
        .parse::<u128>()
        .map_err(|_| "failed to parse numeric value")?;
    let max = unsigned_max_for_width(width)?;
    if val > max {
        return Err("value out of range for unsigned type");
    }
    Ok(ParsedValue {
        kind,
        width,
        value_u: val,
        value_i: val as i128,
        repr: digits.to_string(),
    })
}

fn build_signed_value(
    kind: char,
    width: u32,
    digits: &str,
    sign: Option<char>,
) -> Result<ParsedValue, &'static str> {
    let unsigned = digits
        .parse::<u128>()
        .map_err(|_| "failed to parse numeric value")?;
    let signed_val = if let Some('-') = sign {
        -(unsigned as i128)
    } else {
        unsigned as i128
    };
    let (min, max) = signed_range_for_width(width)?;
    if signed_val < min || signed_val > max {
        return Err("value out of range for signed type");
    }
    Ok(ParsedValue {
        kind,
        width,
        value_u: signed_val.unsigned_abs(),
        value_i: signed_val,
        repr: if signed_val < 0 {
            format!("-{}", digits)
        } else {
            digits.to_string()
        },
    })
}

fn parse_operand(s: &str) -> Result<ParsedValue, &'static str> {
    let parsed = parse_sign_and_digits(s)?;
    let (kind, width) = parse_suffix_and_width(s, parsed.suffix_start)?;

    match kind {
        'U' | 'u' => build_unsigned_value(kind, width, parsed.digits, parsed.sign),
        'I' | 'i' => build_signed_value(kind, width, parsed.digits, parsed.sign),
        _ => Err("unsupported suffix kind"),
    }
}

pub fn interpret(s: &str) -> Result<String, &'static str> {
    let bytes = s.as_bytes();
    if bytes.is_empty() {
        return Err("empty input");
    }

    // if expression with '+' operator
    if let Some(pos) = s.find('+') {
        let left = s[..pos].trim();
        let right = s[pos + 1..].trim();
        let l = parse_operand(left)?;
        let r = parse_operand(right)?;
        // types must match (kind and width)
        if !l.kind.eq_ignore_ascii_case(&r.kind) || l.width != r.width {
            return Err("mismatched operand types");
        }

        return match l.kind.to_ascii_uppercase() {
            'U' => {
                // unsigned add
                let max = unsigned_max_for_width(l.width)?;
                let sum = l.value_u.checked_add(r.value_u).ok_or("overflow")?;
                if sum > max {
                    return Err("value out of range for unsigned type");
                }
                Ok(sum.to_string())
            }
            'I' => {
                let (min, max) = signed_range_for_width(l.width)?;
                let sum = l.value_i.checked_add(r.value_i).ok_or("overflow")?;
                if sum < min || sum > max {
                    return Err("value out of range for signed type");
                }
                Ok(sum.to_string())
            }
            _ => Err("unsupported operand kind"),
        };
    }

    // otherwise single token — parse and return the original repr
    let p = parse_operand(s)?;
    Ok(p.repr)
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
    fn interpret_adds_two_unsigned_u8() {
        assert_eq!(interpret("100U8 + 50U8").unwrap(), "150");
    }

    #[test]
    fn interpret_rejects_overflowing_addition_u8() {
        assert!(interpret("100U8 + 200U8").is_err());
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
        assert_eq!(
            interpret("18446744073709551615U64").unwrap(),
            "18446744073709551615"
        );
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
        assert_eq!(
            interpret("9223372036854775807I64").unwrap(),
            "9223372036854775807"
        );
        assert_eq!(
            interpret("-9223372036854775808I64").unwrap(),
            "-9223372036854775808"
        );
        assert!(interpret("9223372036854775808I64").is_err());
        assert!(interpret("-9223372036854775809I64").is_err());
    }
}
