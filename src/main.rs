/// Represents a parsed Tuff value with its type bounds.
struct ParsedValue {
    num: i64,
    min_val: i64,
    max_val: i64,
    suffix: &'static str,
}

// Parse a single suffixed number (e.g., "100U8", "-5I32")
fn parse_value(token: &str) -> Result<ParsedValue, String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("empty value".to_string());
    }

    // (suffix, min_val, max_val)
    let types = [
        ("U8", 0i64, 255),
        ("U16", 0, 65_535),
        ("U32", 0, 4_294_967_295),
        ("I8", -128, 127),
        ("I16", -32_768, 32_767),
        ("I32", -2_147_483_648, 2_147_483_647),
    ];

    for &(suffix, min_val, max_val) in &types {
        if let Some(num_str) = token.strip_suffix(suffix) {
            if let Ok(num) = num_str.parse::<i64>() {
                if num < min_val || num > max_val {
                    return Err(format!("value {} out of range for {}", num, suffix));
                }
                return Ok(ParsedValue {
                    num,
                    min_val,
                    max_val,
                    suffix,
                });
            }
        }
    }

    Err(format!("no valid suffix found in '{}'", token))
}

// Feel free to change param type if required
fn interpret_tuff(source: &str) -> Result<i64, String> {
    let source = source.trim();
    if source.is_empty() {
        return Ok(0);
    }

    // Split on '+' and parse each term (supports arbitrarily many operands)
    let terms: Vec<&str> = source.split('+').collect();

    let first_parsed = parse_value(terms[0])?;
    let suffix = first_parsed.suffix;
    let min_val = first_parsed.min_val;
    let max_val = first_parsed.max_val;

    let mut sum = 0i64;
    for term in &terms {
        let parsed = parse_value(term)?;

        // All operands must have the same type
        if parsed.suffix != suffix {
            return Err(format!(
                "cannot add {} and {}, types must match",
                suffix, parsed.suffix
            ));
        }

        sum += parsed.num;

        // Check result fits within the operand type's range after each addition
        if sum < min_val || sum > max_val {
            return Err(format!("result {} out of range for {}", sum, suffix));
        }
    }

    Ok(sum)
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_tuff_empty_string() {
        assert_eq!(interpret_tuff(""), Ok(0));
    }

    #[test]
    fn test_interpret_tuff_whitespace() {
        assert_eq!(interpret_tuff("   "), Ok(0));
        assert_eq!(interpret_tuff("\t"), Ok(0));
        assert_eq!(interpret_tuff("\n"), Ok(0));
    }

    #[test]
    fn test_interpret_tuff_number_u8() {
        assert_eq!(interpret_tuff("100U8"), Ok(100));
    }

    #[test]
    fn test_interpret_tuff_number_u16() {
        assert_eq!(interpret_tuff("100U16"), Ok(100));
    }

    #[test]
    fn test_interpret_tuff_number_u32() {
        assert_eq!(interpret_tuff("100U32"), Ok(100));
    }

    #[test]
    fn test_interpret_tuff_negative_u32() {
        assert!(interpret_tuff("-100U32").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_u8() {
        assert!(interpret_tuff("256U8").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_u16() {
        assert!(interpret_tuff("65536U16").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_u32() {
        assert!(interpret_tuff("4294967296U32").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_i8() {
        assert!(interpret_tuff("128I8").is_err());
        assert!(interpret_tuff("-129I8").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_i16() {
        assert!(interpret_tuff("32768I16").is_err());
        assert!(interpret_tuff("-32769I16").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_i32() {
        assert!(interpret_tuff("2147483648I32").is_err());
        assert!(interpret_tuff("-2147483649I32").is_err());
    }

    #[test]
    fn test_interpret_tuff_addition() {
        assert_eq!(interpret_tuff("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn test_interpret_tuff_addition_overflow_u8() {
        // 1 + 255 = 256, which exceeds U8 max (255)
        assert!(interpret_tuff("1U8 + 255U8").is_err());
    }

    #[test]
    fn test_interpret_tuff_addition_multiple_terms() {
        // Support infinitely many terms: 1 + 2 + 3 = 6
        assert_eq!(interpret_tuff("1U8 + 2U8 + 3U8"), Ok(6));
    }
}
