macro_rules! parse_suffix {
    ($input:expr, $suffix:literal, $ty:ty, $max:expr) => {
        if let Some(num) = $input.strip_suffix($suffix) {
            let value: $ty = num.parse().map_err(|_| "invalid literal")?;
            return Ok((value as i64, $max));
        }
    };
}

fn parse_literal(input: &str) -> Result<(i64, u64), &'static str> {
    let trimmed = input.trim();

    if trimmed.is_empty() {
        return Err("empty literal");
    }

    if let Some(num) = trimmed.strip_suffix("U64") {
        let value: u64 = num.parse().map_err(|_| "invalid literal")?;
        if value > i64::MAX as u64 {
            return Err("literal exceeds i64 range");
        }
        return Ok((value as i64, u64::MAX));
    }

    parse_suffix!(trimmed, "U32", u32, u32::MAX as u64);
    parse_suffix!(trimmed, "U16", u16, u16::MAX as u64);
    parse_suffix!(trimmed, "U8", u8, u8::MAX as u64);
    parse_suffix!(trimmed, "I8", i8, 0); // signed, no unsigned overflow check

    Err("unknown literal")
}

fn interpret_tuff(input: &str) -> Result<i64, &'static str> {
    let trimmed = input.trim();

    if trimmed.is_empty() {
        return Ok(0);
    }

    if trimmed.contains('+') {
        return trimmed
            .split('+')
            .try_fold((0i64, 0u64), |(acc, max_bound), part| {
                let (term, bound) = parse_literal(part)?;
                let new_max = max_bound.max(bound);
                let sum = acc.checked_add(term).ok_or("i64 overflow")?;
                if new_max > 0 && sum as u64 > new_max {
                    return Err("unsigned overflow");
                }
                Ok((sum, new_max))
            })
            .map(|(val, _)| val);
    }

    parse_literal(trimmed).map(|(val, _)| val)
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpret_empty_string_returns_zero() {
        assert_eq!(interpret_tuff(""), Ok(0));
    }

    #[test]
    fn interpret_whitespace_returns_zero() {
        assert_eq!(interpret_tuff("   "), Ok(0));
    }

    #[test]
    fn interpret_u8_literal() {
        assert_eq!(interpret_tuff("100U8"), Ok(100));
    }

    #[test]
    fn interpret_negative_u8_literal() {
        assert!(interpret_tuff("-100U8").is_err());
    }

    #[test]
    fn interpret_u8_literal_out_of_range() {
        assert!(interpret_tuff("256U8").is_err());
    }

    #[test]
    fn interpret_u16_literal() {
        assert_eq!(interpret_tuff("100U16"), Ok(100));
    }

    #[test]
    fn interpret_u16_literal_max() {
        assert_eq!(interpret_tuff("65535U16"), Ok(65535));
    }

    #[test]
    fn interpret_negative_u16_literal() {
        assert!(interpret_tuff("-1U16").is_err());
    }

    #[test]
    fn interpret_u16_literal_out_of_range() {
        assert!(interpret_tuff("65536U16").is_err());
    }

    #[test]
    fn interpret_u32_literal() {
        assert_eq!(interpret_tuff("100U32"), Ok(100));
    }

    #[test]
    fn interpret_u32_literal_max() {
        assert_eq!(interpret_tuff("4294967295U32"), Ok(4294967295));
    }

    #[test]
    fn interpret_negative_u32_literal() {
        assert!(interpret_tuff("-1U32").is_err());
    }

    #[test]
    fn interpret_u32_literal_out_of_range() {
        assert!(interpret_tuff("4294967296U32").is_err());
    }

    #[test]
    fn interpret_u64_literal() {
        assert_eq!(interpret_tuff("100U64"), Ok(100));
    }

    #[test]
    fn interpret_u64_literal_max_i64() {
        assert_eq!(
            interpret_tuff("9223372036854775807U64"),
            Ok(9223372036854775807)
        );
    }

    #[test]
    fn interpret_negative_u64_literal() {
        assert!(interpret_tuff("-1U64").is_err());
    }

    #[test]
    fn interpret_u64_literal_exceeds_i64() {
        assert!(interpret_tuff("9223372036854775808U64").is_err());
    }

    #[test]
    fn interpret_i8_literal_negative() {
        assert_eq!(interpret_tuff("-100I8"), Ok(-100));
    }

    #[test]
    fn interpret_i8_literal_positive() {
        assert_eq!(interpret_tuff("100I8"), Ok(100));
    }

    #[test]
    fn interpret_i8_literal_min() {
        assert_eq!(interpret_tuff("-128I8"), Ok(-128));
    }

    #[test]
    fn interpret_i8_literal_max() {
        assert_eq!(interpret_tuff("127I8"), Ok(127));
    }

    #[test]
    fn interpret_i8_literal_out_of_range_negative() {
        assert!(interpret_tuff("-129I8").is_err());
    }

    #[test]
    fn interpret_i8_literal_out_of_range_positive() {
        assert!(interpret_tuff("128I8").is_err());
    }

    #[test]
    fn interpret_addition_u8() {
        assert_eq!(interpret_tuff("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn interpret_addition_u8_three_terms() {
        assert_eq!(interpret_tuff("1U8 + 2U8 + 3U8"), Ok(6));
    }

    #[test]
    fn interpret_addition_u8_overflow() {
        assert!(interpret_tuff("1U8 + 255U8").is_err());
    }
}
