use crate::variables::Environment;

pub fn resolve_dereference(var_name: &str, env: &mut Environment) -> Result<(i32, String), String> {
    let var_info = env
        .get(var_name)
        .ok_or_else(|| format!("Undefined variable: {}", var_name))?
        .clone();

    if !var_info.type_name.starts_with('*') {
        return Err(format!(
            "Cannot dereference non-pointer type '{}'",
            var_info.type_name
        ));
    }

    if let Some(pointed_var_name) = var_info.points_to {
        let pointed_var = env
            .get(&pointed_var_name)
            .ok_or_else(|| format!("Referenced variable '{}' not found", pointed_var_name))?
            .clone();
        let val = pointed_var
            .value
            .ok_or_else(|| format!("Variable '{}' is not initialized", pointed_var_name))?;
        let deref_type = var_info.type_name.trim_start_matches('*').to_string();
        Ok((val, deref_type))
    } else {
        Err(format!(
            "Pointer variable '{}' does not point to anything",
            var_name
        ))
    }
}

pub fn resolve_reference(ref_var_name: &str, env: &Environment) -> Result<String, String> {
    let ref_var_info = env
        .get(ref_var_name)
        .ok_or_else(|| format!("Undefined variable: {}", ref_var_name))?
        .clone();

    let _ = ref_var_info
        .value
        .ok_or_else(|| format!("Variable '{}' is not initialized", ref_var_name))?;

    let base_type = if ref_var_info.type_name.is_empty() {
        "I32".to_string()
    } else {
        ref_var_info.type_name.clone()
    };
    Ok(format!("*{}", base_type))
}
