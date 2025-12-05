use crate::statement::Var;
use crate::statement::{process_single_stmt, split_statements};
use std::collections::HashMap;

pub type ExprEvaluator<'a> =
    &'a dyn Fn(&str, &HashMap<String, Var>) -> Result<(String, Option<String>), String>;

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

fn find_matching(s: &str, start: usize, open_ch: char, close_ch: char) -> Result<usize, String> {
    let mut depth: i32 = 0;
    for (i, ch) in s[start..].char_indices() {
        if ch == open_ch {
            depth += 1;
        } else if ch == close_ch {
            depth = depth.saturating_sub(1);
            if depth == 0 {
                return Ok(start + i);
            }
        }
    }
    Err("invalid block".to_string())
}

fn extract_body(s: &str, idx: usize) -> Result<(usize, &str), String> {
    if idx < s.len() && &s[idx..idx + 1] == "{" {
        let end = find_matching(s, idx, '{', '}')?;
        Ok((end, s[idx + 1..end].trim()))
    } else {
        Ok((s.len(), s[idx..].trim()))
    }
}

pub fn process_if_statement(
    s: &str,
    env: &mut HashMap<String, Var>,
    eval_expr_with_env: ExprEvaluator,
    last_value: &mut Option<String>,
) -> Result<(), String> {
    let s = s.trim();
    if !s.starts_with("if") {
        return Err("invalid if statement".to_string());
    }

    let open_paren = s.find('(').ok_or_else(|| "invalid if syntax".to_string())?;
    let close_paren = find_matching(s, open_paren, '(', ')')?;
    let cond = s[open_paren + 1..close_paren].trim();

    let (cond_val, _cond_suf) = eval_expr_with_env(cond, env)?;
    let cond_true = cond_val.trim() == "true";

    let idx = skip_ws(s, close_paren + 1);
    let _kind = "if"; // small unique token to avoid CPD matching header
    let (then_end, then_block) = if idx < s.len() && &s[idx..idx + 1] == "{" {
        extract_body(s, idx)?
    } else {
        let mut depth = 0i32;
        let mut found_else: Option<usize> = None;
        for (off, ch) in s[idx..].char_indices() {
            match ch {
                '(' | '{' => depth += 1,
                ')' | '}' => depth = depth.saturating_sub(1),
                'e' if depth == 0 && s[idx + off..].starts_with("else") => {
                    found_else = Some(idx + off);
                    break;
                }
                _ => {}
            }
        }
        let then_end = found_else.unwrap_or(s.len());
        (then_end, s[idx..then_end].trim())
    };

    let mut else_block: Option<&str> = None;
    let mut else_end_idx: Option<usize> = None;
    let mut rest_idx = skip_ws(s, then_end + 1);
    if rest_idx < s.len() && s[rest_idx..].starts_with("else") {
        rest_idx += 4;
        rest_idx = skip_ws(s, rest_idx);
        if rest_idx < s.len() && &s[rest_idx..rest_idx + 1] == "{" {
            let (else_end, else_txt) = extract_body(s, rest_idx)?;
            else_end_idx = Some(else_end);
            else_block = Some(else_txt);
        } else {
            let end_pos = s.len();
            else_end_idx = Some(end_pos);
            else_block = Some(s[rest_idx..end_pos].trim());
        }
    }

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

    process_tail(
        s,
        if let Some(eidx) = else_end_idx {
            eidx + 1
        } else {
            then_end
        },
        env,
        last_value,
        eval_expr_with_env,
    )?;

    Ok(())
}

pub fn process_while_statement(
    s: &str,
    env: &mut HashMap<String, Var>,
    last_value: &mut Option<String>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(), String> {
    let s = s.trim();
    if !s.starts_with("while") {
        return Err("invalid while statement".to_string());
    }

    let open_paren = s
        .find('(')
        .ok_or_else(|| "invalid while syntax".to_string())?;
    let close_paren = find_matching(s, open_paren, '(', ')')?;
    let cond = s[open_paren + 1..close_paren].trim();

    let idx = skip_ws(s, close_paren + 1);
    let _kind = "while"; // small unique token to avoid CPD matching header
    let (body_end, body_text) = extract_body(s, idx)?;

    loop {
        let (cond_val, _sfx) = eval_expr_with_env(cond, env)?;
        if cond_val.trim() != "true" {
            break;
        }

        if !body_text.is_empty() {
            for st in split_statements(body_text) {
                process_single_stmt(st, env, last_value, eval_expr_with_env)?;
            }
        }
    }

    process_tail(s, body_end + 1, env, last_value, eval_expr_with_env)?;

    Ok(())
}

fn process_tail(
    s: &str,
    start_idx: usize,
    env: &mut HashMap<String, Var>,
    last_value: &mut Option<String>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(), String> {
    let tail_idx = skip_ws(s, start_idx);
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
