use std::io::{self, BufRead, Write};

#[allow(dead_code)]
pub fn interpret_tuff(input: &str) -> Result<i64, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }

    // Try to parse a numeric literal with type suffix
    if let Some(result) = try_parse_typed_literal(trimmed, input) {
        return result;
    }

    // Try plain integer parse (defaults to I64)
    match trimmed.parse::<i64>() {
        Ok(n) => Ok(n),
        Err(_) => Err(format!("Cannot interpret: {}", input)),
    }
}

/// Tries to parse a literal with a type suffix like U8, I16, etc.
/// Returns Some(Ok/Err) if a recognized suffix is found, None otherwise.
fn try_parse_typed_literal(trimmed: &str, original: &str) -> Option<Result<i64, String>> {
    let (stripped, type_name, min_val, max_val) = if let Some(s) = trimmed
        .strip_suffix("U8")
        .or_else(|| trimmed.strip_suffix("u8"))
    {
        (s, "U8", 0i64, u8::MAX as i64)
    } else if let Some(s) = trimmed
        .strip_suffix("U16")
        .or_else(|| trimmed.strip_suffix("u16"))
    {
        (s, "U16", 0i64, u16::MAX as i64)
    } else if let Some(s) = trimmed
        .strip_suffix("U32")
        .or_else(|| trimmed.strip_suffix("u32"))
    {
        (s, "U32", 0i64, u32::MAX as i64)
    } else if let Some(s) = trimmed
        .strip_suffix("U64")
        .or_else(|| trimmed.strip_suffix("u64"))
    {
        (s, "U64", 0i64, i64::MAX)
    } else if let Some(s) = trimmed
        .strip_suffix("I8")
        .or_else(|| trimmed.strip_suffix("i8"))
    {
        (s, "I8", i8::MIN as i64, i8::MAX as i64)
    } else if let Some(s) = trimmed
        .strip_suffix("I16")
        .or_else(|| trimmed.strip_suffix("i16"))
    {
        (s, "I16", i16::MIN as i64, i16::MAX as i64)
    } else if let Some(s) = trimmed
        .strip_suffix("I32")
        .or_else(|| trimmed.strip_suffix("i32"))
    {
        (s, "I32", i32::MIN as i64, i32::MAX as i64)
    } else if let Some(s) = trimmed
        .strip_suffix("I64")
        .or_else(|| trimmed.strip_suffix("i64"))
    {
        (s, "I64", i64::MIN, i64::MAX)
    } else {
        return None;
    };

    match stripped.parse::<i64>() {
        Ok(n) => {
            if n < min_val || n > max_val {
                Some(Err(format!(
                    "Invalid value: {} (out of range for {})",
                    original, type_name
                )))
            } else {
                Some(Ok(n))
            }
        }
        Err(_) => Some(Err(format!("Invalid numeric literal: {}", original))),
    }
}

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = io::BufWriter::new(stdout.lock());

    println!("Tuff REPL (type 'quit' to exit)");

    for line in stdin.lock().lines() {
        match line {
            Ok(input) => {
                let trimmed = input.trim();
                if trimmed.eq_ignore_ascii_case("quit") {
                    break;
                }
                if trimmed.is_empty() {
                    continue;
                }

                match interpret_tuff(trimmed) {
                    Ok(value) => writeln!(out, "{}", value).unwrap(),
                    Err(e) => eprintln!("Error: {}", e),
                }
            }
            Err(e) => {
                eprintln!("Error reading input: {}", e);
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string_returns_zero() {
        assert_eq!(interpret_tuff(""), Ok(0));
    }

    #[test]
    fn test_whitespace_returns_zero() {
        assert_eq!(interpret_tuff("   "), Ok(0));
    }

    #[test]
    fn test_numeric_literal_u8() {
        assert_eq!(interpret_tuff("100U8"), Ok(100));
    }

    #[test]
    fn test_negative_u8_returns_error() {
        assert!(interpret_tuff("-100U8").is_err());
    }

    #[test]
    fn test_u8_overflow_returns_error() {
        assert!(interpret_tuff("256U8").is_err());
    }

    // --- U16 tests ---
    #[test]
    fn test_valid_u16() {
        assert_eq!(interpret_tuff("30000U16"), Ok(30_000));
    }

    #[test]
    fn test_u16_overflow_returns_error() {
        assert!(interpret_tuff("65536U16").is_err());
    }

    // --- U32 tests ---
    #[test]
    fn test_valid_u32() {
        assert_eq!(interpret_tuff("4000000000U32"), Ok(4_000_000_000));
    }

    // --- U64 tests ---
    #[test]
    fn test_valid_u64() {
        assert_eq!(interpret_tuff("9223372036854775807U64"), Ok(i64::MAX));
    }

    // --- I8 tests ---
    #[test]
    fn test_valid_i8() {
        assert_eq!(interpret_tuff("-128I8"), Ok(-128));
    }

    #[test]
    fn test_i8_overflow_returns_error() {
        assert!(interpret_tuff("128I8").is_err());
    }

    // --- I16 tests ---
    #[test]
    fn test_valid_i16() {
        assert_eq!(interpret_tuff("-32768I16"), Ok(-32_768));
    }

    #[test]
    fn test_i16_overflow_returns_error() {
        assert!(interpret_tuff("32768I16").is_err());
    }

    // --- I32 tests ---
    #[test]
    fn test_valid_i32() {
        assert_eq!(interpret_tuff("-2147483648I32"), Ok(i32::MIN as i64));
    }

    #[test]
    fn test_i32_overflow_returns_error() {
        assert!(interpret_tuff("2147483648I32").is_err());
    }

    // --- I64 tests ---
    #[test]
    fn test_valid_i64() {
        assert_eq!(interpret_tuff("-9223372036854775808I64"), Ok(i64::MIN));
    }

    // --- Case insensitive suffix tests ---
    #[test]
    fn test_lowercase_suffixes() {
        assert_eq!(interpret_tuff("100u8"), Ok(100));
        assert_eq!(interpret_tuff("-5i32"), Ok(-5));
    }

    // --- Plain integer (defaults to I64) ---
    #[test]
    fn test_plain_integer() {
        assert_eq!(interpret_tuff("42"), Ok(42));
        assert_eq!(interpret_tuff("-99"), Ok(-99));
    }
}
