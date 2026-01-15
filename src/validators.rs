#[allow(dead_code)]
pub fn validate_u8(value: i64) -> Result<i32, String> {
    if (0..=255).contains(&value) {
        Ok(value as i32)
    } else {
        Err("Value out of range for U8".to_string())
    }
}

#[allow(dead_code)]
pub fn validate_u16(value: i64) -> Result<i32, String> {
    if (0..=65535).contains(&value) {
        Ok(value as i32)
    } else {
        Err("Value out of range for U16".to_string())
    }
}

#[allow(dead_code)]
pub fn validate_u32(value: i64) -> Result<i32, String> {
    if (0..=4294967295).contains(&value) {
        Ok(value as i32)
    } else {
        Err("Value out of range for U32".to_string())
    }
}

#[allow(dead_code)]
pub fn validate_u64(value: i64) -> Result<i32, String> {
    if value >= 0 {
        Ok(value as i32)
    } else {
        Err("Value out of range for U64".to_string())
    }
}

#[allow(dead_code)]
pub fn validate_i8(value: i64) -> Result<i32, String> {
    if (-128..=127).contains(&value) {
        Ok(value as i32)
    } else {
        Err("Value out of range for I8".to_string())
    }
}

#[allow(dead_code)]
pub fn validate_i16(value: i64) -> Result<i32, String> {
    if (-32768..=32767).contains(&value) {
        Ok(value as i32)
    } else {
        Err("Value out of range for I16".to_string())
    }
}

#[allow(dead_code)]
pub fn validate_i32(value: i64) -> Result<i32, String> {
    if (-2147483648..=2147483647).contains(&value) {
        Ok(value as i32)
    } else {
        Err("Value out of range for I32".to_string())
    }
}

#[allow(dead_code)]
pub fn validate_type_range(suffix: &str, value: i64) -> Result<i32, String> {
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
