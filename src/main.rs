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
fn parse_number(input: &str) -> Result<(i32, usize), String> {
    let trimmed = input.trim_start();
    let ws_offset = input.len() - trimmed.len();

    // Find digit part
    let digit_end = trimmed
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(trimmed.len());

    if digit_end == 0 {
        return Err("No digits found".to_string());
    }

    let digit_str = &trimmed[..digit_end];
    let value = digit_str.parse::<i64>().map_err(|e| e.to_string())?;

    // Find suffix part (letters followed by digits, like U8, I16)
    let remainder = &trimmed[digit_end..];
    let suffix_end = remainder
        .find(|c: char| !c.is_alphanumeric())
        .unwrap_or(remainder.len());

    let suffix = &remainder[..suffix_end];
    let result = validate_type_range(&suffix.to_uppercase(), value)?;
    Ok((result, ws_offset + digit_end + suffix_end))
}

#[allow(dead_code)]
fn interpret(input: &str) -> Result<i32, String> {
    let input = input.trim();
    let (mut result, mut pos) = parse_number(input)?;

    while pos < input.len() {
        let rest = &input[pos..];
        let trimmed_rest = rest.trim_start();
        pos += rest.len() - trimmed_rest.len();

        if pos >= input.len() {
            break;
        }

        let op = trimmed_rest.chars().next().ok_or("Unexpected end")?;
        pos += 1;

        let rest = &input[pos..];
        let (num, len) = parse_number(rest)?;
        pos += len;

        result = match op {
            '+' => result + num,
            '-' => result - num,
            '*' => result * num,
            '/' => result / num,
            _ => return Err(format!("Unknown operator: {}", op)),
        };
    }

    Ok(result)
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

    // Arithmetic tests
    #[test]
    fn test_addition() {
        assert_eq!(interpret("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn test_addition_mixed_suffix() {
        assert_eq!(interpret("1 + 2U8"), Ok(3));
    }

    #[test]
    fn test_addition_different_types() {
        assert_eq!(interpret("1U8 + 2U16"), Ok(3));
    }

    #[test]
    fn test_addition_overflow() {
        assert!(interpret("1U8 + 65565U16").is_err());
    }

    #[test]
    fn test_chained_addition() {
        assert_eq!(interpret("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn test_chained_with_out_of_range() {
        assert!(interpret("1U8 + 1 + 65564U16").is_err());
    }
}
