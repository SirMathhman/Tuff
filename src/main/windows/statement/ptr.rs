use super::{StatementContext, Var};
use std::collections::HashMap;

pub fn parse_address_of(
    rhs: &str,
    env: &HashMap<String, Var>,
) -> Result<(String, bool, Var), String> {
    if !(rhs.starts_with("&mut ") || (rhs.starts_with('&') && !rhs.starts_with("&&"))) {
        return Err("not an address-of expression".to_string());
    }
    let is_mutref = rhs.starts_with("&mut ");
    let inner = if is_mutref {
        rhs[5..].trim()
    } else {
        rhs[1..].trim()
    };

    if inner.is_empty() || !inner.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("invalid address-of expression".to_string());
    }

    let target = env
        .get(inner)
        .ok_or_else(|| format!("address-of to undeclared variable: {}", inner))?
        .clone();

    Ok((inner.to_string(), is_mutref, target))
}

#[allow(clippy::too_many_arguments)]
pub fn assign_ptr_to_existing_var(
    ctx: &mut StatementContext,
    name: &str,
    ptr_val: String,
    ptr_suffix: Option<String>,
) -> Result<(), String> {
    let var = ctx
        .env
        .get_mut(name)
        .ok_or_else(|| format!("assignment-to-undeclared-variable: {}", name))?;
    if !var.mutable {
        return Err("assignment to immutable variable".to_string());
    }

    apply_assignment_to_var(var, ptr_val, ptr_suffix)?;
    *ctx.last_value = None;
    Ok(())
}

pub fn apply_assignment_to_var(
    var: &mut Var,
    value: String,
    expr_suffix: Option<String>,
) -> Result<(), String> {
    var.value = value;
    var.suffix = expr_suffix;
    Ok(())
}
