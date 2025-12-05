use super::Var;
use crate::range_check::{check_signed_range, check_unsigned_range, SUFFIXES};
use std::collections::HashMap;

pub fn resolve_alias<'a>(env: &'a HashMap<String, Var>, mut ty: &'a str) -> Option<&'a str> {
    // Resolve a chain of type aliases like A -> B -> I32
    let mut seen = 0;
    while !SUFFIXES.contains(&ty) {
        let key = format!("__alias__{}", ty);
        if let Some(v) = env.get(&key) {
            ty = v.value.as_str();
        } else {
            return None;
        }
        seen += 1;
        if seen > 10 {
            // avoid infinite alias loops
            return None;
        }
    }
    Some(ty)
}

pub fn validate_type(env: &HashMap<String, Var>, value: &str, ty: &str) -> Result<(), String> {
    // Only validate numeric primitive suffix types (e.g. "U8", "I32")
    // If the type is not a known numeric suffix, treat it as a user-defined
    // type (e.g. struct) and skip numeric validation.
    // If the type is an alias, resolve it to a base suffix (e.g. I32)
    let resolved = if SUFFIXES.contains(&ty) {
        Some(ty)
    } else {
        resolve_alias(env, ty)
    };
    let ty = if let Some(t) = resolved {
        t
    } else {
        return Ok(());
    };

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
