pub const SUFFIXES: [&str; 10] = [
    "U8", "U16", "U32", "U64", "USize", "I8", "I16", "I32", "I64", "Char",
];

pub fn check_unsigned_range(value: u128, suffix: &str) -> Result<(), String> {
    let max = match suffix {
        "U8" => u8::MAX as u128,
        "U16" => u16::MAX as u128,
        "U32" => u32::MAX as u128,
        "U64" => u64::MAX as u128,
        "USize" => usize::MAX as u128,
        _ => u128::MAX,
    };
    if value > max {
        return Err(format!("value out of range for {}", suffix));
    }
    Ok(())
}

pub fn check_signed_range(value: i128, suffix: &str) -> Result<(), String> {
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
