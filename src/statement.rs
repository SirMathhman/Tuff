use crate::control::{process_if_statement, process_while_statement, ControlContext};
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct Var {
    pub mutable: bool,
    pub suffix: Option<String>,
    pub value: String,
    pub borrowed_mut: bool,
    pub declared_type: Option<String>,
}

pub type ExprEvaluator<'a> =
    &'a dyn Fn(&str, &HashMap<String, Var>) -> Result<(String, Option<String>), String>;
pub struct StatementContext<'a> {
    pub env: &'a mut HashMap<String, Var>,
    pub eval_expr: ExprEvaluator<'a>,
    pub last_value: &'a mut Option<(String, Option<String>)>,
}
mod block;
pub mod helpers;
mod mut_capture;
pub mod top;
use crate::range_check::SUFFIXES;
pub use block::{eval_block_expr, eval_block_expr_mut, split_statements};
pub use helpers::{
    collect_droppable_vars, parse_fn_literal, resolve_fn_or_eval_rhs, transform_class_to_fn,
};
use mut_capture::try_call_with_mut_captures;
// try_copy_fn_definition moved to helpers.rs

// helpers moved to helpers.rs

fn run_block_stmt(s: &str, ctx: &mut StatementContext) -> Result<(), String> {
    let s = s.trim();

    if s.starts_with('{') && s.ends_with('}') {
        let inner = s[1..s.len() - 1].trim();
        let (val, suf) = eval_block_expr(inner, ctx.env, ctx.eval_expr)?;
        *ctx.last_value = Some((val, suf));
        return Ok(());
    }

    if s.starts_with("if") {
        let mut tmp_last: Option<String> = None;
        let mut ctrl_ctx = ControlContext {
            env: ctx.env,
            eval_expr: ctx.eval_expr,
            last_value: &mut tmp_last,
        };
        process_if_statement(s, &mut ctrl_ctx)?;
        return Ok(());
    }

    if s.starts_with("while") {
        let mut tmp_last: Option<String> = None;
        let mut ctrl_ctx = ControlContext {
            env: ctx.env,
            eval_expr: ctx.eval_expr,
            last_value: &mut tmp_last,
        };
        process_while_statement(s, &mut ctrl_ctx)?;
        return Ok(());
    }

    if s.starts_with("fn ") && s.contains('{') && !s.contains("=>") {
        // Only error if it's a full function definition with braces (not a function literal)
        // Function literals like `fn () => 100` should be allowed as expressions
        return Err("functions cannot be defined inside blocks".to_string());
    }

    // Handle named function literals inside blocks: store them in the environment
    // and return the function value so it can be used as an expression
    if s.starts_with("fn ") && s.contains("=>") {
        if let Some((fn_name, captures_str, params_str, return_type, body)) =
            helpers::parse_fn_literal(s)
        {
            // Store function with format: params|return_type|body
            let fn_value = format!("{}|{}|{}", params_str, return_type, body);

            if !fn_name.is_empty() {
                // If no explicit captures provided, detect referenced variables automatically
                let final_captures_str = if captures_str.is_empty() {
                    top::detect_captures(&body, &params_str, ctx.env)
                } else {
                    captures_str
                };

                let fn_key = format!("__fn__{}", fn_name);
                ctx.env.insert(
                    fn_key.clone(),
                    Var {
                        mutable: false,
                        value: fn_value.clone(),
                        suffix: Some("FN".to_string()),
                        borrowed_mut: false,
                        declared_type: None,
                    },
                );

                if !final_captures_str.is_empty() {
                    let captures_key = format!("__captures__{}", fn_name);
                    ctx.env.insert(
                        captures_key,
                        Var {
                            mutable: false,
                            value: final_captures_str,
                            suffix: Some("CAPTURES".to_string()),
                            borrowed_mut: false,
                            declared_type: None,
                        },
                    );
                }
            }
            // Return the function value so it can be used as an expression result
            *ctx.last_value = Some((fn_value, Some("FN".to_string())));
            return Ok(());
        }
    }

    if let Some(stripped) = s.strip_prefix("return ") {
        // Handle return statement: evaluate expression and signal early exit
        let expr = stripped.trim();
        let expr = if let Some(stripped) = expr.strip_suffix(';') {
            stripped.trim()
        } else {
            expr
        };
        let (value, suf) = (ctx.eval_expr)(expr, ctx.env)?;
        let return_signal = if let Some(suffix) = suf {
            format!("__RETURN__:{}|{}", value, suffix)
        } else {
            format!("__RETURN__:{}", value)
        };
        return Err(return_signal);
    }

    if s.starts_with("let ") {
        process_declaration(s, ctx)?;
        return Ok(());
    }

    // Don't treat arrow functions as assignments (=> is not an assignment operator)
    if s.contains('=') && !s.contains("=>") && !s.starts_with("let ") {
        process_assignment(s, ctx)?;
        return Ok(());
    }

    // function calls with mutable captures handled specially below
    if let Some((value, suf)) = try_call_with_mut_captures(s, ctx)? {
        *ctx.last_value = Some((value, suf));
        return Ok(());
    }

    let (value, suf) = (ctx.eval_expr)(s, ctx.env)?;
    *ctx.last_value = Some((value, suf));
    Ok(())
}

// helper control logic in control.rs

fn eval_rhs(
    rhs: &str,
    env: &HashMap<String, Var>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(String, Option<String>), String> {
    if rhs.starts_with('{') && rhs.ends_with('}') {
        eval_block_expr(rhs[1..rhs.len() - 1].trim(), env, eval_expr_with_env)
    } else {
        eval_expr_with_env(rhs, env)
    }
}

#[allow(clippy::too_many_arguments)]
fn check_declared_compat(
    env: &HashMap<String, Var>,
    declared: &str,
    expr_suffix: Option<&String>,
    value: &str,
) -> Result<(), String> {
    if let Some(sfx) = expr_suffix {
        if sfx != declared {
            if let Some(resolved) = crate::statement::validate::resolve_alias(env, declared) {
                if sfx != resolved {
                    return Err("type suffix mismatch on assignment".to_string());
                }
            } else {
                return Err("type suffix mismatch on assignment".to_string());
            }
        }
    }
    crate::statement::validate::validate_type(env, value, declared)?;
    Ok(())
}

mod ptr;
pub use ptr::{apply_assignment_to_var, assign_ptr_to_existing_var, parse_address_of};

fn process_declaration(s: &str, ctx: &mut StatementContext) -> Result<(), String> {
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
        let ty_opt = if after.starts_with(':') {
            let t = after[1..].trim();
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
        let (value, _expr_suffix) = eval_rhs(rhs, ctx.env, ctx.eval_expr)?;

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
            let (inner, is_mutref, target_clone) = parse_address_of(rhs, ctx.env)?;

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
            resolve_fn_or_eval_rhs(ctx.env, rhs, name, ctx.eval_expr)?
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

fn process_assignment(s: &str, ctx: &mut StatementContext) -> Result<(), String> {
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
                check_declared_compat(ctx.env, declared, expr_suffix.as_ref(), &value)?;
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
        let (ptr_val, _ptr_suffix) = eval_rhs(inner, ctx.env, ctx.eval_expr)?;
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
        let (value, expr_suffix) = eval_rhs(rhs, ctx.env, ctx.eval_expr)?;

        // Validate against declared suffix if present, before mutable borrow
        if let Some(target_info) = ctx.env.get(target) {
            if !target_info.mutable {
                return Err("assignment to immutable variable".to_string());
            }
            if let Some(declared) = &target_info.suffix {
                check_declared_compat(ctx.env, declared, expr_suffix.as_ref(), &value)?;
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
        let (inner0, is_mutref0, target_clone) = parse_address_of(rhs, ctx.env)?;
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
    let (value, expr_suffix) = resolve_fn_or_eval_rhs(ctx.env, rhs, name, ctx.eval_expr)?;

    // Validate against declared suffix if present before taking mutable borrow
    if let Some(var_info) = ctx.env.get(name) {
        if !var_info.mutable {
            return Err("assignment to immutable variable".to_string());
        }
        if let Some(declared) = &var_info.suffix {
            check_declared_compat(ctx.env, declared, expr_suffix.as_ref(), &value)?;
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

mod validate; // validation helpers
/// Context for top-level statement processing
pub struct TopStmtContext<'a> {
    pub env: &'a mut HashMap<String, Var>,
    pub eval_expr: ExprEvaluator<'a>,
    pub last_value: &'a mut Option<String>,
}
pub use top::process_single_stmt;

// Return a list of (variable_name, declared_type) for variables that have a declared type
// collect_droppable_vars moved to helpers.rs and re-exported
