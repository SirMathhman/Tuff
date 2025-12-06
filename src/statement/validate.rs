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
    // Support array types like [I32; 3; 3]
    if ty.starts_with('[') && ty.ends_with(']') {
        // inner format: <elem_type; ...>
        let inner = &ty[1..ty.len() - 1];
        let parts: Vec<&str> = inner.split(';').map(|s| s.trim()).collect();
        if parts.is_empty() {
            return Ok(());
        }
        let elem_ty = match parts.first() {
            Some(p) => *p,
            None => return Ok(()),
        };

        // If the value is encoded array from evaluator, parse element strings
        if let Some(arr_rest) = value.strip_prefix("__ARRAY__:") {
            if let Some(bar_idx) = arr_rest.find('|') {
                let elems_str = &arr_rest[bar_idx + 1..];
                if elems_str.is_empty() {
                    return Ok(());
                }
                for item in elems_str.split(',') {
                    let item = item.trim();
                    // strip any element suffix
                    let mut stripped = item;
                    for &suf in SUFFIXES.iter() {
                        if item.ends_with(suf) {
                            let pos = item.len() - suf.len();
                            stripped = &item[..pos];
                            break;
                        }
                    }
                    // Validate the element against elem_ty (resolve aliases)
                    if SUFFIXES.contains(&elem_ty) {
                        if elem_ty.starts_with('U') {
                            let v = stripped
                                .parse::<u128>()
                                .map_err(|_| "invalid numeric value".to_string())?;
                            check_unsigned_range(v, elem_ty)?;
                        } else {
                            let v = stripped
                                .parse::<i128>()
                                .map_err(|_| "invalid numeric value".to_string())?;
                            check_signed_range(v, elem_ty)?;
                        }
                    } else if let Some(resolved) = resolve_alias(env, elem_ty) {
                        if resolved.starts_with('U') {
                            let v = stripped
                                .parse::<u128>()
                                .map_err(|_| "invalid numeric value".to_string())?;
                            check_unsigned_range(v, resolved)?;
                        } else {
                            let v = stripped
                                .parse::<i128>()
                                .map_err(|_| "invalid numeric value".to_string())?;
                            check_signed_range(v, resolved)?;
                        }
                    } else {
                        // non-numeric element type (e.g. struct) — skip validation
                    }
                }
                return Ok(());
            }
        }
        // If value wasn't encoded array, fall through to default handlers
    }
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
