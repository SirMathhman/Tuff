use crate::range_check::SUFFIXES;
use crate::statement::StatementContext;
use crate::statement::Var;

pub(crate) fn process_declaration(s: &str, ctx: &mut StatementContext) -> Result<(), String> {
    let rest = s.trim_start_matches("let").trim();
    let (mut mutable, rest) = if rest.starts_with("mut ") {
        (true, rest.trim_start_matches("mut").trim())
    } else {
        (false, rest)
    };

    let mut parts = rest.splitn(2, '=');
    let left = parts
        .next()
        .ok_or_else(|| "invalid declaration".to_string())?
        .trim();
    let rhs_opt = parts.next().map(|s| s.trim()).filter(|s| !s.is_empty());

    // Support destructuring assignment style: let { x, y } = expr
    if left.trim_start().starts_with('{') {
        // find the matching closing brace for the pattern
        let mut depth: i32 = 0;
        let mut close_idx: Option<usize> = None;
        for (i, ch) in left.char_indices() {
            match ch {
                '{' => depth += 1,
                '}' => {
                    depth = depth.saturating_sub(1);
                    if depth == 0 {
                        close_idx = Some(i);
                        break;
                    }
                }
                _ => {}
            }
        }

        let close_idx = close_idx.ok_or_else(|| "invalid declaration".to_string())?;
        let pattern = &left[1..close_idx].trim();

        // optional declared type after the pattern (e.g. "{ x, y } : Point")
        let after = left[close_idx + 1..].trim();
        let ty_opt = if let Some(stripped) = after.strip_prefix(':') {
            let t = stripped.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        } else {
            None
        };

        // must have an initializer for pattern destructuring
        let rhs = rhs_opt.ok_or_else(|| "invalid declaration".to_string())?;
        let (value, _expr_suffix) = super::eval_rhs(rhs, ctx.env, ctx.eval_expr)?;

        if !value.starts_with("__STRUCT__:") {
            return Err("destructuring requires struct value".to_string());
        }

        let rest = &value[10..];
        // parts: first is type name, following are key=value entries
        let mut iter = rest.split('|');
        let struct_type = iter.next().unwrap_or("");

        if let Some(declared_type) = &ty_opt {
            if declared_type != struct_type {
                return Err("type suffix mismatch on assignment".to_string());
            }
        }

        // build a map of fields
        let mut fields_map = std::collections::HashMap::new();
        for ent in iter {
            if let Some(eq) = ent.find('=') {
                let fname = &ent[..eq];
                let fval = &ent[eq + 1..];
                fields_map.insert(fname.to_string(), fval.to_string());
            }
        }

        // parse pattern names and bind variables
        for part in pattern.split(',') {
            let var_name = part.trim();
            if var_name.is_empty() {
                continue;
            }
            if ctx.env.contains_key(var_name) {
                return Err("duplicate declaration".to_string());
            }

            let fval = fields_map
                .get(var_name)
                .ok_or_else(|| format!("field '{}' not found on struct instance", var_name))?;

            // detect suffix from known SUFFIXES
            let mut found_suf: Option<String> = None;
            let mut val_str = fval.as_str();
            for &suf in SUFFIXES.iter() {
                if val_str.ends_with(suf) {
                    let trimmed = &val_str[..val_str.len() - suf.len()];
                    found_suf = Some(suf.to_string());
                    val_str = trimmed;
                    break;
                }
            }

            ctx.env.insert(
                var_name.to_string(),
                Var {
                    mutable,
                    suffix: found_suf,
                    value: val_str.to_string(),
                    borrowed_mut: false,
                    declared_type: None,
                },
            );
        }

        *ctx.last_value = None;
        return Ok(());
    }

    let mut left_parts = left.splitn(2, ':');
    let name = left_parts
        .next()
        .ok_or_else(|| "invalid declaration".to_string())?
        .trim();
    if name.is_empty() {
        return Err("invalid declaration".to_string());
    }
    let ty_opt = left_parts
        .next()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    if ctx.env.contains_key(name) {
        return Err("duplicate declaration".to_string());
    }

    // If an explicit type was provided, treat the declaration as mutable.
    if ty_opt.is_some() && !mutable {
        mutable = true;
    }

    let (value, expr_suffix) = if let Some(rhs) = rhs_opt {
        // Handle address-of in declarations so we can mark mutable borrows
        if rhs.starts_with("&mut ") || (rhs.starts_with('&') && !rhs.starts_with("&&")) {
            let (inner, is_mutref, target_clone) = super::parse_address_of(rhs, ctx.env)?;

            if is_mutref {
                // set borrowed_mut on the real variable (mutable borrow)
                let target = ctx
                    .env
                    .get_mut(&inner)
                    .ok_or_else(|| format!("address-of to undeclared variable: {}", inner))?;
                if !target.mutable {
                    return Err("cannot take mutable reference of immutable variable".to_string());
                }
                if target.borrowed_mut {
                    return Err("variable already mutably borrowed".to_string());
                }
                target.borrowed_mut = true;
            } else if target_clone.borrowed_mut {
                return Err(
                    "cannot take immutable reference while variable already mutably borrowed"
                        .to_string(),
                );
            }

            let (ptr_val, ptr_suffix) = crate::pointer_utils::build_ptr_components(
                target_clone.suffix.as_ref(),
                &inner,
                is_mutref,
            );

            (ptr_val, ptr_suffix)
        } else {
            // assigning a function reference by name, e.g. `let f = get;`
            super::resolve_fn_or_eval_rhs(ctx.env, rhs, name, ctx.eval_expr)?
        }
    } else {
        if ty_opt.is_none() {
            return Err("invalid declaration".to_string());
        }
        if !mutable {
            mutable = true;
        }
        ("".to_string(), None)
    };

    if let Some(ty) = &ty_opt {
        if !value.is_empty() {
            crate::statement::validate::validate_type(ctx.env, &value, ty)?;
        }
    }

    let stored_suffix = ty_opt.clone().or(expr_suffix);
    ctx.env.insert(
        name.to_string(),
        Var {
            mutable,
            suffix: stored_suffix,
            value,
            borrowed_mut: false,
            declared_type: ty_opt,
        },
    );
    *ctx.last_value = None;
    Ok(())
}
