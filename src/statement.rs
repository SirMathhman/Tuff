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

    // If statement
    if s.starts_with("if") {
        // For block-local execution, run chosen branch against local_env which should modify outer env only when intended
        // but here block expressions inside run_block_stmt use local_env, so we evaluate branches into local_env.
        // Convert local_env into a temporary env and execute
        // We can reuse process_if_statement by cloning env into a temp and mapping results back, but for simplicity
        // evaluate chosen branch using local_env so changes remain local to the block expression evaluation.
        // Implement a wrapper that runs process_if_statement on local_env
        let mut tmp_last: Option<String> = None;
        process_if_statement(s, local_env, &mut tmp_last, eval_expr_with_env)?;
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

/// Process an if/else statement that appears at block or top-level.
fn process_if_statement(
    s: &str,
    env: &mut HashMap<String, Var>,
    last_value: &mut Option<String>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(), String> {
    // Expect syntax: if (<cond>) <then_block> [else <else_block>]
    let s = s.trim();
    if !s.starts_with("if") {
        return Err("invalid if statement".to_string());
    }

    // Find '(' and matching ')'
    let open_paren = s.find('(').ok_or_else(|| "invalid if syntax".to_string())?;
    let mut depth = 0i32;
    let mut close_paren = None;
    for (i, ch) in s[open_paren..].char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    close_paren = Some(open_paren + i);
                    break;
                }
            }
            _ => {}
        }
    }
    let close_paren = close_paren.ok_or_else(|| "invalid if syntax".to_string())?;
    let cond = s[open_paren + 1..close_paren].trim();

    // Evaluate condition (we accept boolean literals or boolean-returning expressions)
    let (cond_val, _cond_suf) = eval_expr_with_env(cond, env)?;
    let cond_true = cond_val.trim() == "true";

    // After the condition, find the then-block (must be a braced block)
    let mut idx = close_paren + 1;
    fn skip_ws(s: &str, mut i: usize) -> usize {
        while i < s.len()
            && s.as_bytes()
                .get(i)
                .map(|b| b.is_ascii_whitespace())
                .unwrap_or(false)
        {
            i += 1;
        }
        i
    }
    idx = skip_ws(s, idx);
    if idx >= s.len() || &s[idx..idx + 1] != "{" {
        return Err("if statement must have a braced then-block".to_string());
    }

    // Find matching brace for then-block
    depth = 0;
    let mut then_end = None;
    for (off, ch) in s[idx..].char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    then_end = Some(idx + off);
                    break;
                }
            }
            _ => {}
        }
    }
    let then_end = then_end.ok_or_else(|| "invalid then block".to_string())?;
    let then_block = &s[idx + 1..then_end].trim();

    // Check for optional else
    let mut else_block: Option<&str> = None;
    let mut else_end_idx: Option<usize> = None;
    let mut rest_idx = skip_ws(s, then_end + 1);
    if rest_idx < s.len() && s[rest_idx..].starts_with("else") {
        rest_idx += 4;
        rest_idx = skip_ws(s, rest_idx);
        if rest_idx >= s.len() || &s[rest_idx..rest_idx + 1] != "{" {
            return Err("else must have a braced block".to_string());
        }
        // find matching brace
        depth = 0;
        let mut else_end = None;
        for (off, ch) in s[rest_idx..].char_indices() {
            match ch {
                '{' => depth += 1,
                '}' => {
                    depth = depth.saturating_sub(1);
                    if depth == 0 {
                        else_end = Some(rest_idx + off);
                        break;
                    }
                }
                _ => {}
            }
        }
        let else_end = else_end.ok_or_else(|| "invalid else block".to_string())?;
        else_end_idx = Some(else_end);
        else_block = Some(s[rest_idx + 1..else_end].trim());
    }

    // Execute appropriate branch in the provided env
    let chosen = if cond_true {
        then_block
    } else {
        else_block.unwrap_or("")
    };
    if !chosen.is_empty() {
        for st in split_statements(chosen) {
            process_single_stmt(st, env, last_value, eval_expr_with_env)?;
        }
    }

    // If there is remaining text after the if/else, treat it as subsequent statements
    // (e.g. "if (...) { ... } else { ... } x")
    let mut tail_idx = then_end + 1;
    tail_idx = skip_ws(s, tail_idx);
    // If an else block was present, move the tail index past it
    if let Some(eidx) = else_end_idx {
        // find start of else block
        let mut rest_idx = then_end + 1;
        while rest_idx < s.len()
            && s.as_bytes()
                .get(rest_idx)
                .map(|b| b.is_ascii_whitespace())
                .unwrap_or(false)
        {
            rest_idx += 1;
        }
        if rest_idx < s.len() && s[rest_idx..].starts_with("else") {
            tail_idx = eidx + 1;
        }
    }

    while tail_idx < s.len()
        && s.as_bytes()
            .get(tail_idx)
            .map(|b| b.is_ascii_whitespace())
            .unwrap_or(false)
    {
        tail_idx += 1;
    }
    if tail_idx < s.len() {
        let tail = s[tail_idx..].trim();
        if !tail.is_empty() {
            for st in split_statements(tail) {
                process_single_stmt(st, env, last_value, eval_expr_with_env)?;
            }
        }
    }
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

    if env.contains_key(name) {
        return Err("duplicate declaration".to_string());
    }

    // If there's an RHS, evaluate it; if not, allow declaration-only only when a type is provided
    let (value, expr_suffix) = if let Some(rhs) = rhs_opt {
        eval_rhs(rhs, env, eval_expr_with_env)?
    } else {
        if ty_opt.is_none() {
            return Err("invalid declaration".to_string());
        }
        // If there's no initializer but an explicit type was provided, make
        // the variable mutable by default to allow later assignment.
        if !mutable {
            mutable = true;
        }
        ("".to_string(), None)
    };

    // Validate only when there is an initial RHS value
    if let Some(ty) = &ty_opt {
        if !value.is_empty() {
            validate_type(&value, ty)?;
        }
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

    // If statement
    if s.starts_with("if") {
        process_if_statement(s, env, last_value, eval_expr_with_env)?;
        return Ok(());
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
