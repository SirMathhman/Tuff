#![deny(clippy::too_many_lines)]

#[allow(dead_code)]
fn interpret(input: &str) -> Result<i32, String> {
    if input.is_empty() {
        Ok(0)
    } else {
        // Find where the alphabetic type suffix starts
        let mut number_end = 0;
        let chars: Vec<char> = input.chars().collect();

        // Handle optional leading minus sign
        if !chars.is_empty() && chars[0] == '-' {
            number_end = 1;
        }

        // Collect all digits after the optional minus sign
        while number_end < chars.len() && chars[number_end].is_numeric() {
            number_end += 1;
        }

        let number_part = &input[..number_end];
        let type_suffix = input[number_end..].to_uppercase();

        if number_part.is_empty() || number_part == "-" {
            Ok(0)
        } else {
            let value: i64 = number_part
                .parse::<i64>()
                .map_err(|_| "Failed to parse number".to_string())?;

            // Determine if type is signed
            let is_signed = type_suffix.starts_with('I') || type_suffix.is_empty();

            // Check for negative on unsigned types
            if !is_signed && value < 0 {
                return Err("Negative numbers are not allowed for unsigned types".to_string());
            }

            // Validate ranges based on type suffix
            match type_suffix.as_str() {
                "U8" => {
                    if value < 0 || value > 255 {
                        return Err("Value exceeds U8 range (0-255)".to_string());
                    }
                }
                "U16" => {
                    if value < 0 || value > 65535 {
                        return Err("Value exceeds U16 range (0-65535)".to_string());
                    }
                }
                "U32" => {
                    if value < 0 || value > 4294967295 {
                        return Err("Value exceeds U32 range (0-4294967295)".to_string());
                    }
                }
                "U64" => {
                    if value < 0 {
                        return Err("Value exceeds U64 range (0-18446744073709551615)".to_string());
                    }
                    // Clamp to i32 max for return
                    return Ok(std::cmp::min(value, i32::MAX as i64) as i32);
                }
                "I8" => {
                    if value < -128 || value > 127 {
                        return Err("Value exceeds I8 range (-128 to 127)".to_string());
                    }
                }
                "I16" => {
                    if value < -32768 || value > 32767 {
                        return Err("Value exceeds I16 range (-32768 to 32767)".to_string());
                    }
                }
                "I32" => {
                    if value < -2147483648 || value > 2147483647 {
                        return Err(
                            "Value exceeds I32 range (-2147483648 to 2147483647)".to_string()
                        );
                    }
                }
                "I64" => {
                    // I64 can hold the value, but we return i32 so clamp if needed
                    return Ok(
                        std::cmp::max(std::cmp::min(value, i32::MAX as i64), i32::MIN as i64)
                            as i32,
                    );
                }
                "" => {
                    // No type suffix - treat as unbounded but must fit in i32
                    if value < i32::MIN as i64 || value > i32::MAX as i64 {
                        return Err("Value exceeds i32 range".to_string());
                    }
                }
                _ => {
                    return Err(format!("Unsupported type suffix: {}", type_suffix));
                }
            }

            // Convert to i32 for return
            if value >= i32::MIN as i64 && value <= i32::MAX as i64 {
                Ok(value as i32)
            } else {
                Err("Value exceeds i32 return range".to_string())
            }
        }
    }
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_empty_string() {
        assert_eq!(interpret(""), Ok(0));
    }

    #[test]
    fn test_interpret_100() {
        assert_eq!(interpret("100"), Ok(100));
    }

    #[test]
    fn test_interpret_100u8() {
        assert_eq!(interpret("100U8"), Ok(100));
    }

    #[test]
    fn test_interpret_negative_100u8() {
        assert!(interpret("-100U8").is_err());
    }

    #[test]
    fn test_interpret_256u8() {
        assert!(interpret("256U8").is_err());
    }

    // U16 tests
    #[test]
    fn test_interpret_256u16() {
        assert_eq!(interpret("256U16"), Ok(256));
    }

    #[test]
    fn test_interpret_65535u16() {
        assert_eq!(interpret("65535U16"), Ok(65535));
    }

    #[test]
    fn test_interpret_65536u16() {
        assert!(interpret("65536U16").is_err());
    }

    // U32 tests
    #[test]
    fn test_interpret_65536u32() {
        assert_eq!(interpret("65536U32"), Ok(65536));
    }

    #[test]
    fn test_interpret_2147483647u32() {
        assert_eq!(interpret("2147483647U32"), Ok(2147483647));
    }

    // U64 tests
    #[test]
    fn test_interpret_2147483648u64() {
        assert_eq!(interpret("2147483648U64"), Ok(2147483647)); // Clamped to i32 max
    }

    // I8 tests
    #[test]
    fn test_interpret_negative_100i8() {
        assert_eq!(interpret("-100I8"), Ok(-100));
    }

    #[test]
    fn test_interpret_127i8() {
        assert_eq!(interpret("127I8"), Ok(127));
    }

    #[test]
    fn test_interpret_128i8() {
        assert!(interpret("128I8").is_err());
    }

    #[test]
    fn test_interpret_negative_128i8() {
        assert_eq!(interpret("-128I8"), Ok(-128));
    }

    #[test]
    fn test_interpret_negative_129i8() {
        assert!(interpret("-129I8").is_err());
    }

    // I16 tests
    #[test]
    fn test_interpret_negative_1000i16() {
        assert_eq!(interpret("-1000I16"), Ok(-1000));
    }

    #[test]
    fn test_interpret_32767i16() {
        assert_eq!(interpret("32767I16"), Ok(32767));
    }

    #[test]
    fn test_interpret_32768i16() {
        assert!(interpret("32768I16").is_err());
    }

    #[test]
    fn test_interpret_negative_32768i16() {
        assert_eq!(interpret("-32768I16"), Ok(-32768));
    }

    #[test]
    fn test_interpret_negative_32769i16() {
        assert!(interpret("-32769I16").is_err());
    }

    // I32 tests
    #[test]
    fn test_interpret_negative_100i32() {
        assert_eq!(interpret("-100I32"), Ok(-100));
    }

    #[test]
    fn test_interpret_2147483647i32() {
        assert_eq!(interpret("2147483647I32"), Ok(2147483647));
    }

    #[test]
    fn test_interpret_2147483648i32() {
        assert!(interpret("2147483648I32").is_err());
    }

    #[test]
    fn test_interpret_negative_2147483648i32() {
        assert_eq!(interpret("-2147483648I32"), Ok(-2147483648));
    }

    // I64 tests - values that fit in i32
    #[test]
    fn test_interpret_negative_100i64() {
        assert_eq!(interpret("-100I64"), Ok(-100));
    }

    // Type suffix case insensitivity
    #[test]
    fn test_interpret_100u8_lowercase() {
        assert_eq!(interpret("100u8"), Ok(100));
    }
}
