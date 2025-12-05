use crate::range_check::{check_signed_range, check_unsigned_range, SUFFIXES};

pub fn validate_type(value: &str, ty: &str) -> Result<(), String> {
    // Only validate numeric primitive suffix types (e.g. "U8", "I32")
    // If the type is not a known numeric suffix, treat it as a user-defined
    // type (e.g. struct) and skip numeric validation.
    if !SUFFIXES.contains(&ty) {
        return Ok(());
    }

    if ty.starts_with('U') {
        let v = value
            .parse::<u128>()
            .map_err(|_| "invalid numeric value".to_string())?;
        check_unsigned_range(v, ty)?;
    } else {
        let v = value
            .parse::<i128>()
            .map_err(|_| "invalid numeric value".to_string())?;
        check_signed_range(v, ty)?;
    }
    Ok(())
}
