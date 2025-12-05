pub fn interpret(input: &str) -> Result<String, String> {
    // Handle a simple binary addition: "<lhs> + <rhs>" where both operands
    // are integers with the same type suffix (e.g. "1U8 + 2U8").
    if input.contains('+') {
        let mut parts = input.splitn(2, '+');
        let lhs = parts
            .next()
            .ok_or_else(|| "invalid addition expression".to_string())?
            .trim();
        let rhs = parts
            .next()
            .ok_or_else(|| "invalid addition expression".to_string())?
            .trim();

        // helper to parse an operand into (is_unsigned, suffix, numeric_value)
        fn parse_operand(op: &str) -> Result<(bool, &str, u128, i128), String> {
            const SUFFIXES: [&str; 8] = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];
            for sfx in SUFFIXES {
                if op.ends_with(sfx) {
                    let pos = op.len() - sfx.len();
                    if pos == 0 {
                        return Err("missing numeric part".to_string());
                    }
                    let numeric = &op[..pos];

                    if sfx.starts_with('U') {
                        if numeric.starts_with('-') {
                            return Err("negative value for unsigned suffix".to_string());
                        }
                        let num_str = numeric.strip_prefix('+').unwrap_or(numeric);
                        let parsed = num_str.parse::<u128>().map_err(|_| "invalid numeric value".to_string())?;

                        let max = match sfx {
                            "U8" => u8::MAX as u128,
                            "U16" => u16::MAX as u128,
                            "U32" => u32::MAX as u128,
                            "U64" => u64::MAX as u128,
                            _ => u128::MAX,
                        };
                        if parsed > max {
                            return Err(format!("value out of range for {}", sfx));
                        }
                        return Ok((true, sfx, parsed, parsed as i128));
                    } else {
                        // signed
                        let num_str = numeric.strip_prefix('+').unwrap_or(numeric);
                        let parsed = num_str.parse::<i128>().map_err(|_| "invalid numeric value".to_string())?;
                        let (min, max) = match sfx {
                            "I8" => (i8::MIN as i128, i8::MAX as i128),
                            "I16" => (i16::MIN as i128, i16::MAX as i128),
                            "I32" => (i32::MIN as i128, i32::MAX as i128),
                            "I64" => (i64::MIN as i128, i64::MAX as i128),
                            _ => (i128::MIN, i128::MAX),
                        };
                        if parsed < min || parsed > max {
                            return Err(format!("value out of range for {}", sfx));
                        }
                        return Ok((false, sfx, parsed as u128, parsed));
                    }
                }
            }
            Err("operand missing known suffix".to_string())
        }

        let l = parse_operand(lhs)?;
        let r = parse_operand(rhs)?;

        // Require same suffix
        if l.1 != r.1 {
            return Err("type suffix mismatch".to_string());
        }

        if l.0 && r.0 {
            // unsigned addition using u128
            let sum = l.2.checked_add(r.2).ok_or_else(|| "overflow".to_string())?;
            let max = match l.1 {
                "U8" => u8::MAX as u128,
                "U16" => u16::MAX as u128,
                "U32" => u32::MAX as u128,
                "U64" => u64::MAX as u128,
                _ => u128::MAX,
            };
            if sum > max {
                return Err(format!("value out of range for {}", l.1));
            }
            return Ok(sum.to_string());
        } else if !l.0 && !r.0 {
            // signed addition using i128
            let sum = l.3.checked_add(r.3).ok_or_else(|| "overflow".to_string())?;
            let (min, max) = match l.1 {
                "I8" => (i8::MIN as i128, i8::MAX as i128),
                "I16" => (i16::MIN as i128, i16::MAX as i128),
                "I32" => (i32::MIN as i128, i32::MAX as i128),
                "I64" => (i64::MIN as i128, i64::MAX as i128),
                _ => (i128::MIN, i128::MAX),
            };
            if sum < min || sum > max {
                return Err(format!("value out of range for {}", l.1));
            }
            return Ok(sum.to_string());
        } else {
            return Err("cannot mix signed and unsigned in addition".to_string());
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

                    let max = match sfx {
                        "U8" => u8::MAX as u128,
                        "U16" => u16::MAX as u128,
                        "U32" => u32::MAX as u128,
                        "U64" => u64::MAX as u128,
                        _ => u128::MAX,
                    };

                    if parsed > max {
                        return Err(format!("value out of range for {}", sfx));
                    }
                }

                return Ok(numeric_part.to_string());
            }
        }
    }

    Ok(input.to_string())
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
    }
}
