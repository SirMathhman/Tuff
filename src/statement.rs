use crate::control::{process_if_statement, process_while_statement, ControlContext};
use crate::range_check::{check_signed_range, check_unsigned_range};
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

pub fn split_statements(seq: &str) -> Vec<&str> {
    let mut stmts: Vec<&str> = Vec::new();
    let mut start = 0usize;
    let mut depth: i32 = 0;
    for (i, ch) in seq.char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => depth = depth.saturating_sub(1),
            ';' if depth == 0 => {
                let stmt = seq[start..i].trim();
                if !stmt.is_empty() {
                    stmts.push(stmt);
                }
                start = i + 1;
            }
            _ => {}
        }
    }
    let stmt = seq[start..].trim();
    if !stmt.is_empty() {
        stmts.push(stmt);
    }
    stmts
}

pub fn eval_block_expr(
    block_text: &str,
    env: &HashMap<String, Var>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(String, Option<String>), String> {
    let mut local_env = env.clone();
    let stmts = split_statements(block_text.trim());
    let mut last_value: Option<(String, Option<String>)> = None;

    for st in stmts {
        let mut ctx = StatementContext {
            env: &mut local_env,
            eval_expr: eval_expr_with_env,
            last_value: &mut last_value,
        };
        run_block_stmt(st, &mut ctx)?;
    }

    if let Some((v, suf)) = last_value {
        Ok((v, suf))
    } else {
        Ok(("".to_string(), None))
    }
}

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
                return Err("assignment to undeclared variable".to_string());
            }

            // Use an immutable borrow first to capture current value and suffix,
            // then evaluate the expression using those literals so we don't keep
            // the mutable borrow across evaluation.
            let current = ctx
                .env
                .get(name)
                .ok_or_else(|| "assignment to undeclared variable".to_string())?;
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
                .ok_or_else(|| "assignment to undeclared variable".to_string())?;
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

    if !ctx.env.contains_key(name) {
        return Err("assignment to undeclared variable".to_string());
    }

    let (value, expr_suffix) = eval_rhs(rhs, ctx.env, ctx.eval_expr)?;

    let var = ctx
        .env
        .get_mut(name)
        .ok_or_else(|| "assignment to undeclared variable".to_string())?;
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

#[allow(clippy::too_many_arguments)]
pub fn process_single_stmt(
    stmt_text: &str,
    env: &mut HashMap<String, Var>,
    last_value: &mut Option<String>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(), String> {
    let mut ctx = TopStmtContext {
        env,
        eval_expr: eval_expr_with_env,
        last_value,
    };
    process_single_stmt_internal(stmt_text, &mut ctx)
}

fn process_single_stmt_internal(stmt_text: &str, ctx: &mut TopStmtContext) -> Result<(), String> {
    let s = stmt_text.trim();

    if s.starts_with('{') && s.ends_with('}') {
        let inner = s[1..s.len() - 1].trim();
        if inner.contains(';') {
            for inner_stmt in split_statements(inner) {
                process_single_stmt_internal(inner_stmt, ctx)?;
            }
            return Ok(());
        } else {
            let (value, _suffix) = (ctx.eval_expr)(inner, ctx.env)?;
            *ctx.last_value = Some(value);
            return Ok(());
        }
    }

    if s.starts_with("if") {
        let mut ctrl_ctx = ControlContext {
            env: ctx.env,
            eval_expr: ctx.eval_expr,
            last_value: ctx.last_value,
        };
        process_if_statement(s, &mut ctrl_ctx)?;
        return Ok(());
    }

    if s.starts_with("while") {
        let mut ctrl_ctx = ControlContext {
            env: ctx.env,
            eval_expr: ctx.eval_expr,
            last_value: ctx.last_value,
        };
        process_while_statement(s, &mut ctrl_ctx)?;
        return Ok(());
    }

    if s.starts_with("let ") {
        let mut block_last: Option<(String, Option<String>)> = None;
        let is_decl = true; // marker
        let mut stmt_ctx = StatementContext {
            env: ctx.env,
            eval_expr: ctx.eval_expr,
            last_value: &mut block_last,
        };
        let _ = is_decl;
        process_declaration(s, &mut stmt_ctx)?;
        *ctx.last_value = None;
        return Ok(());
    }

    if s.contains('=') && !s.starts_with("let ") {
        let mut block_last: Option<(String, Option<String>)> = None;
        let is_assign = true; // marker
        let mut stmt_ctx = StatementContext {
            env: ctx.env,
            eval_expr: ctx.eval_expr,
            last_value: &mut block_last,
        };
        let _ = is_assign;
        process_assignment(s, &mut stmt_ctx)?;
        *ctx.last_value = None;
        return Ok(());
    }

    let (value, _suffix) = (ctx.eval_expr)(s, ctx.env)?;
    *ctx.last_value = Some(value);
    Ok(())
}
