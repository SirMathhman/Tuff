use crate::control::{process_if_statement, process_while_statement, ControlContext};
use crate::range_check::{check_signed_range, check_unsigned_range, SUFFIXES};
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct Var {
    pub mutable: bool,
    pub suffix: Option<String>,
    pub value: String,
}

pub type ExprEvaluator<'a> =
    &'a dyn Fn(&str, &HashMap<String, Var>) -> Result<(String, Option<String>), String>;

/// Context for statement processing within blocks
pub struct StatementContext<'a> {
    pub env: &'a mut HashMap<String, Var>,
    pub eval_expr: ExprEvaluator<'a>,
    pub last_value: &'a mut Option<(String, Option<String>)>,
}
mod block;
pub use block::{eval_block_expr, split_statements};

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

    if s.starts_with("fn ") {
        // For now, functions are only top-level; not allowed inside blocks
        return Err("functions cannot be defined inside blocks".to_string());
    }

    if let Some(stripped) = s.strip_prefix("return ") {
        // Handle return statement: evaluate the expression and signal early exit
        let expr = stripped.trim();
        // Remove trailing semicolon if present
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

    if s.contains('=') && !s.starts_with("let ") {
        process_assignment(s, ctx)?;
        return Ok(());
    }

    let (value, suf) = (ctx.eval_expr)(s, ctx.env)?;
    *ctx.last_value = Some((value, suf));
    Ok(())
}

// process_if_statement moved to control.rs

// process_while_statement moved to control.rs

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

    // If an explicit type was provided, treat the declaration as mutable by
    // default to allow later assignments at top-level and in blocks.
    if ty_opt.is_some() && !mutable {
        mutable = true;
    }

    let (value, expr_suffix) = if let Some(rhs) = rhs_opt {
        eval_rhs(rhs, ctx.env, ctx.eval_expr)?
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
            validate_type(&value, ty)?;
        }
    }

    let stored_suffix = ty_opt.or(expr_suffix);
    ctx.env.insert(
        name.to_string(),
        Var {
            mutable,
            suffix: stored_suffix,
            value,
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
            // then evaluate the expression using those literals so we don't keep
            // the mutable borrow across evaluation.
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

            // Validate against declared suffix if present, then store the result
            if let Some(declared) = &current.suffix {
                if let Some(sfx) = &expr_suffix {
                    if sfx != declared {
                        return Err("type suffix mismatch on assignment".to_string());
                    }
                }
                validate_type(&value, declared)?;
            }

            let var = ctx
                .env
                .get_mut(name)
                .ok_or_else(|| format!("assignment-to-undeclared-variable: {}", name))?;
            var.value = value;
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

        // Now update the pointed-to variable (must be mutable)
        let target_var = ctx
            .env
            .get_mut(target)
            .ok_or_else(|| "dereference to invalid pointer".to_string())?;
        if !target_var.mutable {
            return Err("assignment to immutable variable".to_string());
        }

        if let Some(declared) = &target_var.suffix {
            if let Some(sfx) = &expr_suffix {
                if sfx != declared {
                    return Err("type suffix mismatch on assignment".to_string());
                }
            }
            validate_type(&value, declared)?;
        }

        target_var.value = value;
        *ctx.last_value = None;
        return Ok(());
    }

    if !ctx.env.contains_key(name) {
        return Err(format!("assignment-to-undeclared-variable: {}", name));
    }

    let (value, expr_suffix) = eval_rhs(rhs, ctx.env, ctx.eval_expr)?;

    let var = ctx
        .env
        .get_mut(name)
        .ok_or_else(|| format!("assignment-to-undeclared-variable: {}", name))?;
    if !var.mutable {
        return Err("assignment to immutable variable".to_string());
    }

    if let Some(declared) = &var.suffix {
        if let Some(sfx) = &expr_suffix {
            if sfx != declared {
                return Err("type suffix mismatch on assignment".to_string());
            }
        }
        validate_type(&value, declared)?;
    }

    var.value = value;
    *ctx.last_value = None;
    Ok(())
}

fn validate_type(value: &str, ty: &str) -> Result<(), String> {
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

/// Context for top-level statement processing
pub struct TopStmtContext<'a> {
    pub env: &'a mut HashMap<String, Var>,
    pub eval_expr: ExprEvaluator<'a>,
    pub last_value: &'a mut Option<String>,
}
pub use top::process_single_stmt;

mod top;
