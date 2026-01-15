#[allow(dead_code)]
fn validate_u8(value: i64) -> Result<i32, String> {
    if (0..=255).contains(&value) {
        Ok(value as i32)
    } else {
        Err("Value out of range for U8".to_string())
    }
}

#[allow(dead_code)]
fn validate_u16(value: i64) -> Result<i32, String> {
    if (0..=65535).contains(&value) {
        Ok(value as i32)
    } else {
        Err("Value out of range for U16".to_string())
    }
}

#[allow(dead_code)]
fn validate_u32(value: i64) -> Result<i32, String> {
    if (0..=4294967295).contains(&value) {
        Ok(value as i32)
    } else {
        Err("Value out of range for U32".to_string())
    }
}

#[allow(dead_code)]
fn validate_u64(value: i64) -> Result<i32, String> {
    if value >= 0 {
        Ok(value as i32)
    } else {
        Err("Value out of range for U64".to_string())
    }
}

#[allow(dead_code)]
fn validate_i8(value: i64) -> Result<i32, String> {
    if (-128..=127).contains(&value) {
        Ok(value as i32)
    } else {
        Err("Value out of range for I8".to_string())
    }
}

#[allow(dead_code)]
fn validate_i16(value: i64) -> Result<i32, String> {
    if (-32768..=32767).contains(&value) {
        Ok(value as i32)
    } else {
        Err("Value out of range for I16".to_string())
    }
}

#[allow(dead_code)]
fn validate_i32(value: i64) -> Result<i32, String> {
    if (-2147483648..=2147483647).contains(&value) {
        Ok(value as i32)
    } else {
        Err("Value out of range for I32".to_string())
    }
}

#[allow(dead_code)]
fn validate_type_range(suffix: &str, value: i64) -> Result<i32, String> {
    match suffix {
        "U8" => validate_u8(value),
        "U16" => validate_u16(value),
        "U32" => validate_u32(value),
        "U64" => validate_u64(value),
        "I8" => validate_i8(value),
        "I16" => validate_i16(value),
        "I32" => validate_i32(value),
        "I64" => Ok(value as i32),
        "" => Ok(value as i32),
        _ => Err(format!("Unknown type suffix: {}", suffix)),
    }
}

#[allow(dead_code)]
fn interpret(input: &str) -> Result<i32, String> {
    let trimmed = input
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>();

    if trimmed.is_empty() {
        Err("No digits found".to_string())
    } else {
        let value = trimmed.parse::<i64>().map_err(|e| e.to_string())?;
        let suffix = input
            .chars()
            .skip_while(|c| c.is_ascii_digit())
            .collect::<String>()
            .to_uppercase();
        validate_type_range(&suffix, value)
    }
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

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

    // U8 tests
    #[test]
    fn test_u8_valid() {
        assert_eq!(interpret("255U8"), Ok(255));
    }

    #[test]
    fn test_u8_out_of_range() {
        assert!(interpret("256U8").is_err());
    }

    // U16 tests
    #[test]
    fn test_u16_valid() {
        assert_eq!(interpret("65535U16"), Ok(65535));
    }

    #[test]
    fn test_u16_out_of_range() {
        assert!(interpret("65536U16").is_err());
    }

    // U32 tests
    #[test]
    fn test_u32_valid() {
        assert_eq!(interpret("4294967295U32"), Ok(-1)); // Wraps when cast to i32
    }

    // I8 tests
    #[test]
    fn test_i8_valid() {
        assert_eq!(interpret("127I8"), Ok(127));
    }

    #[test]
    fn test_i8_out_of_range() {
        assert!(interpret("128I8").is_err());
    }

    // I16 tests
    #[test]
    fn test_i16_valid() {
        assert_eq!(interpret("32767I16"), Ok(32767));
    }

    #[test]
    fn test_i16_out_of_range() {
        assert!(interpret("32768I16").is_err());
    }

    // I32 tests
    #[test]
    fn test_i32_valid() {
        assert_eq!(interpret("2147483647I32"), Ok(2147483647));
    }

    #[test]
    fn test_i32_out_of_range() {
        assert!(interpret("2147483648I32").is_err());
    }

    // No suffix test
    #[test]
    fn test_no_suffix() {
        assert_eq!(interpret("100"), Ok(100));
    }
}
