use super::{apply_assignment_to_var, assign_ptr_to_existing_var};
use crate::statement::StatementContext;

pub(crate) fn process_assignment(s: &str, ctx: &mut StatementContext) -> Result<(), String> {
    // Support compound assignment operators like +=, -=, *=, /=
    let mut handled = false;
    for &(op, sym) in [("+=", "+"), ("-=", "-"), ("*=", "*"), ("/=", "/")].iter() {
        if let Some(pos) = s.find(op) {
            let name = s[..pos].trim();
            let rhs = s[pos + op.len()..].trim();

            if !ctx.env.contains_key(name) {
                return Err(format!("assignment-to-undeclared-variable: {}", name));
            }

            // Use an immutable borrow first to capture current value and suffix,
            // then evaluate the expression using those literals so we don't keep the mutable borrow across evaluation.
            let current = ctx
                .env
                .get(name)
                .ok_or_else(|| format!("assignment-to-undeclared-variable: {}", name))?;
            if !current.mutable {
                return Err("assignment to immutable variable".to_string());
            }

            let left_literal = if let Some(sfx) = &current.suffix {
                format!("{}{}", current.value, sfx)
            } else {
                current.value.clone()
            };

            let expr = format!("{} {} {}", left_literal, sym, rhs);
            let (value, expr_suffix) = (ctx.eval_expr)(expr.as_str(), ctx.env)?;

            // Validate against declared suffix if present and store the result
            if let Some(declared) = &current.suffix {
                super::check_declared_compat(ctx.env, declared, expr_suffix.as_ref(), &value)?;
            }

            let var = ctx
                .env
                .get_mut(name)
                .ok_or_else(|| format!("assignment-to-undeclared-variable: {}", name))?;
            apply_assignment_to_var(var, value, expr_suffix)?;
            *ctx.last_value = None;
            handled = true;
            break;
        }
    }

    if handled {
        return Ok(());
    }

    let mut parts = s.splitn(2, '=');
    let name = parts
        .next()
        .ok_or_else(|| "invalid assignment".to_string())?
        .trim();
    let rhs = parts
        .next()
        .ok_or_else(|| "invalid assignment".to_string())?
        .trim();

    // Handle dereference assignment: "*ptr = rhs"
    if let Some(stripped) = name.strip_prefix('*') {
        let inner = stripped.trim();

        if !ctx.env.contains_key(inner) {
            return Err(format!("assignment-to-undeclared-variable: {}", inner));
        }

        // Evaluate the pointer expression to get the encoded pointer value
        let (ptr_val, _ptr_suffix) = super::eval_rhs(inner, ctx.env, ctx.eval_expr)?;
        if !ptr_val.starts_with("__PTR__:") {
            return Err("assignment to non-pointer target".to_string());
        }

        // Ensure the pointer variable is declared as a mutable pointer (*mut)
        if let Some(ptr_var) = ctx.env.get(inner) {
            if let Some(ps) = &ptr_var.suffix {
                if !ps.starts_with("*mut") {
                    return Err("assignment through immutable pointer".to_string());
                }
            } else {
                return Err("assignment through immutable pointer".to_string());
            }
        }

        // ptr_val format: "__PTR__:<pointee_suffix>|<target_name>"
        let rest = ptr_val
            .strip_prefix("__PTR__:")
            .ok_or_else(|| "invalid pointer encoding".to_string())?;
        let pipe_idx = rest
            .find('|')
            .ok_or_else(|| "invalid pointer encoding".to_string())?;
        let target = &rest[pipe_idx + 1..];

        if !ctx.env.contains_key(target) {
            return Err("dereference to invalid pointer".to_string());
        }

        // Evaluate RHS before taking mutable borrow on the target
        let (value, expr_suffix) = super::eval_rhs(rhs, ctx.env, ctx.eval_expr)?;

        // Validate against declared suffix if present, before mutable borrow
        if let Some(target_info) = ctx.env.get(target) {
            if !target_info.mutable {
                return Err("assignment to immutable variable".to_string());
            }
            if let Some(declared) = &target_info.suffix {
                super::check_declared_compat(ctx.env, declared, expr_suffix.as_ref(), &value)?;
            }
        }

        // Now update the pointed-to variable (must be mutable)
        let target_var = ctx
            .env
            .get_mut(target)
            .ok_or_else(|| "dereference to invalid pointer".to_string())?;

        apply_assignment_to_var(target_var, value, expr_suffix)?;
        *ctx.last_value = None;
        return Ok(());
    }

    if !ctx.env.contains_key(name) {
        return Err(format!("assignment-to-undeclared-variable: {}", name));
    }

    // Special handling when RHS is an address-of operator so we can manage
    // mutable-borrow state (e.g. &mut x) in the environment.
    if rhs.starts_with("&mut ") || (rhs.starts_with('&') && !rhs.starts_with("&&")) {
        // Ensure we can assign to the left-hand variable (it's already checked below),
        // but we need to handle releasing any previous pointer target this variable
        // was referencing.
        let mut prev_target: Option<String> = None;
        if let Some(existing) = ctx.env.get(name) {
            if existing.value.starts_with("__PTR__:") {
                if let Some(rest) = existing.value.strip_prefix("__PTR__:") {
                    if let Some(pipe_idx) = rest.find('|') {
                        prev_target = Some(rest[pipe_idx + 1..].to_string());
                    }
                }
            }
        }

        // Inspect target non-mutably first to make borrow checks without
        // holding multiple mutable borrows at once.
        let (inner0, is_mutref0, target_clone) = super::parse_address_of(rhs, ctx.env)?;
        let inner = inner0.as_str();
        let is_mutref = is_mutref0;

        // If the LHS previously pointed to someone, release its borrow
        if let Some(prev) = prev_target.clone() {
            if let Some(prev_v) = ctx.env.get_mut(&prev) {
                prev_v.borrowed_mut = false;
            }
        }

        // Obtain a mutable borrow for the target to mark it borrowed
        if is_mutref {
            let target = ctx
                .env
                .get_mut(inner)
                .ok_or_else(|| format!("address-of to undeclared variable: {}", inner))?;
            target.borrowed_mut = true;
        } else if target_clone.borrowed_mut {
            return Err(
                "cannot take immutable reference while variable already mutably borrowed"
                    .to_string(),
            );
        }

        let (ptr_val, ptr_suffix) = crate::pointer_utils::build_ptr_components(
            target_clone.suffix.as_ref(),
            inner,
            is_mutref,
        );
        // assign pointer value into existing variable
        assign_ptr_to_existing_var(ctx, name, ptr_val, ptr_suffix)?;
        return Ok(());
    }

    // Special-case: assignment of a named function to an existing variable, e.g. `x = get;`
    let (value, expr_suffix) = super::resolve_fn_or_eval_rhs(ctx.env, rhs, name, ctx.eval_expr)?;

    // Validate against declared suffix if present before taking mutable borrow
    if let Some(var_info) = ctx.env.get(name) {
        if !var_info.mutable {
            return Err("assignment to immutable variable".to_string());
        }
        if let Some(declared) = &var_info.suffix {
            super::check_declared_compat(ctx.env, declared, expr_suffix.as_ref(), &value)?;
        }
    }

    let var = ctx
        .env
        .get_mut(name)
        .ok_or_else(|| format!("assignment-to-undeclared-variable: {}", name))?;

    apply_assignment_to_var(var, value, expr_suffix)?;
    *ctx.last_value = None;
    Ok(())
}
