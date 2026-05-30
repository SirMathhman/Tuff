fn interpret_tuff(input: &str) -> Result<i64, &'static str> {
    let trimmed = input.trim();

    if trimmed.is_empty() {
        return Ok(0);
    }

    if let Some(num) = trimmed.strip_suffix("U64") {
        let value: u64 = num.parse().map_err(|_| "invalid literal")?;
        if value > i64::MAX as u64 {
            return Err("literal exceeds i64 range");
        }
        return Ok(value as i64);
    }

    if let Some(num) = trimmed.strip_suffix("U32") {
        let value: u32 = num.parse().map_err(|_| "invalid literal")?;
        return Ok(value as i64);
    }

    if let Some(num) = trimmed.strip_suffix("U16") {
        let value: u16 = num.parse().map_err(|_| "invalid literal")?;
        return Ok(value as i64);
    }

    if let Some(num) = trimmed.strip_suffix("U8") {
        let value: u8 = num.parse().map_err(|_| "invalid literal")?;
        return Ok(value as i64);
    }

    if let Some(num) = trimmed.strip_suffix("I8") {
        let value: i8 = num.parse().map_err(|_| "invalid literal")?;
        return Ok(value as i64);
    }

    Err("unknown expression")
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
}
