pub fn interpret(input: &str) -> Result<String, String> {
    // Handle a simple binary addition: "<lhs> + <rhs>" where both operands
    // are integers with the same type suffix (e.g. "1U8 + 2U8").
    if input.contains('+') {
        // Support chained additions like "1U8 + 3 + 2U8"
        let parts: Vec<&str> = input.split('+').map(str::trim).filter(|s| !s.is_empty()).collect();
        if parts.is_empty() {
            return Err("invalid addition expression".to_string());
        }

        // (parsing of suffixed operands is handled below per-part)

        // Determine if any parts contain a known suffix. If so, all suffixed parts
        // must have the same suffix; plain numbers will adopt that suffix's type.
        const SUFFIXES: [&str; 8] = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];

        // collect suffixes seen
        let mut seen_suffix: Option<&str> = None;
        for p in &parts {
            for sfx in SUFFIXES {
                if p.ends_with(sfx) {
                    if let Some(existing) = seen_suffix {
                        if existing != sfx {
                            return Err("type suffix mismatch".to_string());
                        }
                    } else {
                        seen_suffix = Some(sfx);
                    }
                }
            }
        }

        // If we have no suffix in any operand, sum as signed i128
        if seen_suffix.is_none() {
            let mut total: i128 = 0;
            for p in &parts {
                let v = p.strip_prefix('+').unwrap_or(p).parse::<i128>().map_err(|_| "invalid numeric value".to_string())?;
                total = total.checked_add(v).ok_or_else(|| "overflow".to_string())?;
            }
            return Ok(total.to_string());
        }

        let suffix = seen_suffix.ok_or_else(|| "internal error determining suffix".to_string())?;
        let unsigned = suffix.starts_with('U');

        if unsigned {
            let mut total: u128 = 0;
            for p in &parts {
                let numeric = if let Some(stripped) = p.strip_suffix(suffix) {
                    stripped
                } else {
                    p
                };
                if numeric.starts_with('-') {
                    return Err("negative value for unsigned suffix".to_string());
                }
                let num_str = numeric.strip_prefix('+').unwrap_or(numeric);
                let v = num_str.parse::<u128>().map_err(|_| "invalid numeric value".to_string())?;
                check_unsigned_range(v, suffix)?;
                total = total.checked_add(v).ok_or_else(|| "overflow".to_string())?;
            }
            check_unsigned_range(total, suffix)?;
            return Ok(total.to_string());
        } else {
            // signed
            let mut total: i128 = 0;
            for p in &parts {
                let numeric = if let Some(stripped) = p.strip_suffix(suffix) {
                    stripped
                } else {
                    p
                };
                let num_str = numeric.strip_prefix('+').unwrap_or(numeric);
                let v = num_str.parse::<i128>().map_err(|_| "invalid numeric value".to_string())?;
                check_signed_range(v, suffix)?;
                total = total.checked_add(v).ok_or_else(|| "overflow".to_string())?;
            }
            check_signed_range(total, suffix)?;
            return Ok(total.to_string());
        }
    }
    const SUFFIXES: [&str; 8] = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];

    for sfx in SUFFIXES {
        if input.ends_with(sfx) {
            let pos = input.len() - sfx.len();
            if pos > 0
                && input
                    .as_bytes()
                    .get(pos - 1)
                    .map(|b| b.is_ascii_digit())
                    .unwrap_or(false)
            {
                // If suffix denotes an unsigned type, reject negative values
                // and ensure the numeric value fits the type's range.
                let numeric_part = &input[..pos];
                if sfx.starts_with('U') {
                    if numeric_part.starts_with('-') {
                        return Err("negative value for unsigned suffix".to_string());
                    }

                    let num_str = numeric_part.strip_prefix('+').unwrap_or(numeric_part);

                    // Parse as a wide unsigned and compare with the type max.
                    let parsed = num_str
                        .parse::<u128>()
                        .map_err(|_| "invalid numeric value for unsigned suffix".to_string())?;

                    check_unsigned_range(parsed, sfx)?;
                }

                return Ok(numeric_part.to_string());
            }
        }
    }

    Ok(input.to_string())
}

fn check_unsigned_range(value: u128, suffix: &str) -> Result<(), String> {
    let max = match suffix {
        "U8" => u8::MAX as u128,
        "U16" => u16::MAX as u128,
        "U32" => u32::MAX as u128,
        "U64" => u64::MAX as u128,
        _ => u128::MAX,
    };
    if value > max {
        return Err(format!("value out of range for {}", suffix));
    }
    Ok(())
}

fn check_signed_range(value: i128, suffix: &str) -> Result<(), String> {
    let (min, max) = match suffix {
        "I8" => (i8::MIN as i128, i8::MAX as i128),
        "I16" => (i16::MIN as i128, i16::MAX as i128),
        "I32" => (i32::MIN as i128, i32::MAX as i128),
        "I64" => (i64::MIN as i128, i64::MAX as i128),
        _ => (i128::MIN, i128::MAX),
    };
    if value < min || value > max {
        return Err(format!("value out of range for {}", suffix));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::interpret;

    #[test]
    fn interpret_returns_same_string() {
        let input = "hello world";
        let out = interpret(input);
        assert_eq!(out, Ok(input.to_string()));
    }

    #[test]
    fn interpret_strips_type_like_suffix() {
        assert_eq!(interpret("100U8"), Ok("100".to_string()));
        assert_eq!(interpret("123U16"), Ok("123".to_string()));
        assert_eq!(interpret("7I32"), Ok("7".to_string()));
        assert_eq!(interpret("900U64"), Ok("900".to_string()));

        // Case-sensitive: lowercase should not match
        assert_eq!(interpret("42u32"), Ok("42u32".to_string()));

        // Don't strip when letters are part of a word
        assert_eq!(interpret("valueU16"), Ok("valueU16".to_string()));

        // digits-only should be unchanged
        assert_eq!(interpret("12345"), Ok("12345".to_string()));

        // Negative value with unsigned suffix is invalid
        assert!(interpret("-100U8").is_err());

        // values above the unsigned max are invalid
        assert!(interpret("256U8").is_err());
        assert_eq!(interpret("255U8"), Ok("255".to_string()));

        // Simple addition of same-suffix operands
        assert_eq!(interpret("1U8 + 2U8"), Ok("3".to_string()));

        // Chained addition where plain numbers adopt the suffixed type
        assert_eq!(interpret("1U8 + 3 + 2U8"), Ok("6".to_string()));
    }
}
