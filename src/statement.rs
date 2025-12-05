use crate::range_check::{check_signed_range, check_unsigned_range};
use std::collections::HashMap;

/// Variable in the interpreter environment.
#[derive(Clone, Debug)]
pub struct Var {
    pub mutable: bool,
    pub suffix: Option<String>,
    pub value: String,
}

/// Type alias for the expression evaluator function signature.
pub type ExprEvaluator<'a> =
    &'a dyn Fn(&str, &HashMap<String, Var>) -> Result<(String, Option<String>), String>;

/// Split a sequence of statements by semicolons, respecting brace nesting.
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

/// Evaluate a braced block as an expression using a cloned local environment.
pub fn eval_block_expr(
    block_text: &str,
    env: &HashMap<String, Var>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(String, Option<String>), String> {
    let mut local_env = env.clone();
    let stmts = split_statements(block_text.trim());
    let mut last_value: Option<(String, Option<String>)> = None;

    for st in stmts {
        run_block_stmt(st, &mut local_env, &mut last_value, eval_expr_with_env)?;
    }

    if let Some((v, suf)) = last_value {
        Ok((v, suf))
    } else {
        Ok(("".to_string(), None))
    }
}

/// Process a single statement inside a block expression.
fn run_block_stmt(
    s: &str,
    local_env: &mut HashMap<String, Var>,
    last_value: &mut Option<(String, Option<String>)>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(), String> {
    let s = s.trim();

    // Nested braced block
    if s.starts_with('{') && s.ends_with('}') {
        let inner = s[1..s.len() - 1].trim();
        let (val, suf) = eval_block_expr(inner, local_env, eval_expr_with_env)?;
        *last_value = Some((val, suf));
        return Ok(());
    }

    // Declaration
    if s.starts_with("let ") {
        process_declaration(s, local_env, last_value, eval_expr_with_env)?;
        return Ok(());
    }

    // Assignment
    if s.contains('=') && !s.starts_with("let ") {
        process_assignment(s, local_env, last_value, eval_expr_with_env)?;
        return Ok(());
    }

    // Expression
    let (value, suf) = eval_expr_with_env(s, local_env)?;
    *last_value = Some((value, suf));
    Ok(())
}

/// Evaluate an RHS expression, handling block expressions specially.
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

/// Process a declaration statement.
fn process_declaration(
    s: &str,
    env: &mut HashMap<String, Var>,
    last_value: &mut Option<(String, Option<String>)>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(), String> {
    let rest = s.trim_start_matches("let").trim();
    let (mutable, rest) = if rest.starts_with("mut ") {
        (true, rest.trim_start_matches("mut").trim())
    } else {
        (false, rest)
    };

    let mut parts = rest.splitn(2, '=');
    let left = parts
        .next()
        .ok_or_else(|| "invalid declaration".to_string())?
        .trim();
    let rhs = parts
        .next()
        .ok_or_else(|| "invalid declaration".to_string())?
        .trim();

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

    if env.contains_key(name) {
        return Err("duplicate declaration".to_string());
    }

    let (value, expr_suffix) = eval_rhs(rhs, env, eval_expr_with_env)?;

    if let Some(ty) = &ty_opt {
        validate_type(&value, ty)?;
    }

    let stored_suffix = ty_opt.or(expr_suffix);
    env.insert(
        name.to_string(),
        Var {
            mutable,
            suffix: stored_suffix,
            value,
        },
    );
    *last_value = None;
    Ok(())
}

/// Process an assignment statement.
fn process_assignment(
    s: &str,
    env: &mut HashMap<String, Var>,
    last_value: &mut Option<(String, Option<String>)>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(), String> {
    let mut parts = s.splitn(2, '=');
    let name = parts
        .next()
        .ok_or_else(|| "invalid assignment".to_string())?
        .trim();
    let rhs = parts
        .next()
        .ok_or_else(|| "invalid assignment".to_string())?
        .trim();

    if !env.contains_key(name) {
        return Err("assignment to undeclared variable".to_string());
    }

    let (value, expr_suffix) = eval_rhs(rhs, env, eval_expr_with_env)?;

    let var = env
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
    *last_value = None;
    Ok(())
}

/// Validate that a value fits within the specified type's range.
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

/// Process a single top-level statement (modifies environment in place).
pub fn process_single_stmt(
    stmt_text: &str,
    env: &mut HashMap<String, Var>,
    last_value: &mut Option<String>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(), String> {
    let s = stmt_text.trim();

    // Braced block statement
    if s.starts_with('{') && s.ends_with('}') {
        let inner = s[1..s.len() - 1].trim();
        if inner.contains(';') {
            for inner_stmt in split_statements(inner) {
                process_single_stmt(inner_stmt, env, last_value, eval_expr_with_env)?;
            }
            return Ok(());
        } else {
            let (value, _suffix) = eval_expr_with_env(inner, env)?;
            *last_value = Some(value);
            return Ok(());
        }
    }

    // Declaration
    if s.starts_with("let ") {
        let mut block_last: Option<(String, Option<String>)> = None;
        process_declaration(s, env, &mut block_last, eval_expr_with_env)?;
        *last_value = None;
        return Ok(());
    }

    // Assignment
    if s.contains('=') && !s.starts_with("let ") {
        let mut block_last: Option<(String, Option<String>)> = None;
        process_assignment(s, env, &mut block_last, eval_expr_with_env)?;
        *last_value = None;
        return Ok(());
    }

    // Expression
    let (value, _suffix) = eval_expr_with_env(s, env)?;
    *last_value = Some(value);
    Ok(())
}
