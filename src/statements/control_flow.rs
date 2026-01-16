use crate::parser::skip_whitespace;
use crate::variables::Environment;

fn consume_required_char(input: &str, pos: &mut usize, ch: char, err: &str) -> Result<(), String> {
    skip_whitespace(input, pos);
    let trimmed = input[*pos..].trim_start();
    if !trimmed.starts_with(ch) {
        return Err(err.to_string());
    }
    *pos += input[*pos..].len() - trimmed.len() + 1;
    Ok(())
}

fn try_consume_open_brace(input: &str, pos: &mut usize) -> bool {
    skip_whitespace(input, pos);
    let trimmed = input[*pos..].trim_start();
    if !trimmed.starts_with('{') {
        return false;
    }
    *pos += input[*pos..].len() - trimmed.len() + 1;
    true
}

fn parse_statement_inner(input: &str, pos: &mut usize, env: &mut Environment) -> Result<(), String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();

    if trimmed.starts_with("let ") {
        *pos += rest.len() - trimmed.len() + 4;
        super::parse_let_statement(input, pos, env)?;
    } else {
        super::parse_assignment_statement(input, pos, env)?;
    }
    Ok(())
}

fn parse_statement_or_block(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(), String> {
    if try_consume_open_brace(input, pos) {
        parse_block(input, pos, env)?;
        consume_required_char(input, pos, '}', "Expected '}' to close block")?;
        Ok(())
    } else {
        parse_statement_inner(input, pos, env)
    }
}

fn skip_single_statement(input: &str, pos: &mut usize) {
    skip_whitespace(input, pos);
    while *pos < input.len() && input.as_bytes()[*pos] != b';' {
        *pos += 1;
    }
    if *pos < input.len() {
        *pos += 1;
    }
}

fn skip_statement_or_block(input: &str, pos: &mut usize) {
    if try_consume_open_brace(input, pos) {

        let mut brace_depth = 1;
        while *pos < input.len() && brace_depth > 0 {
            match input.as_bytes()[*pos] {
                b'{' => brace_depth += 1,
                b'}' => brace_depth -= 1,
                _ => {}
            }
            if brace_depth > 0 {
                *pos += 1;
            }
        }

        if *pos < input.len() && input.as_bytes()[*pos] == b'}' {
            *pos += 1;
        }
    } else {
        skip_single_statement(input, pos);
    }
}

fn parse_if_condition_and_statements(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(), String> {
    consume_required_char(input, pos, '(', "Expected '(' after 'if'")?;

    let condition = crate::parser::interpret_at(input, pos, env)?;

    consume_required_char(input, pos, ')', "Expected ')' after condition")?;

    if condition != 0 {
        parse_statement_or_block(input, pos, env)?;
    } else {
        skip_statement_or_block(input, pos);
    }

    skip_whitespace(input, pos);
    let trimmed = input[*pos..].trim_start();
    if trimmed.starts_with("else") {
        *pos += input[*pos..].len() - trimmed.len() + 4;

        if condition == 0 {
            parse_statement_or_block(input, pos, env)?;
        } else {
            skip_statement_or_block(input, pos);
        }
    }

    Ok(())
}

pub fn parse_if_statement(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<bool, String> {
    if !super::check_keyword_match(input, pos, "if ") {
        return Ok(false);
    }
    parse_if_condition_and_statements(input, pos, env)?;
    Ok(true)
}

fn parse_while_condition_and_statement(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(), String> {
    consume_required_char(input, pos, '(', "Expected '(' after 'while'")?;

    let cond_start = *pos;

    let mut paren_depth = 1;
    let mut scan_pos = *pos;
    while scan_pos < input.len() && paren_depth > 0 {
        match input.as_bytes()[scan_pos] {
            b'(' => paren_depth += 1,
            b')' => paren_depth -= 1,
            _ => {}
        }
        if paren_depth > 0 {
            scan_pos += 1;
        }
    }

    if paren_depth != 0 {
        return Err("Mismatched parentheses in while condition".to_string());
    }

    let cond_end = scan_pos;
    let stmt_start = cond_end + 1;
    let cond_str = &input[cond_start..cond_end];

    loop {
        let mut cond_pos = 0;
        let condition = crate::parser::interpret_at(cond_str, &mut cond_pos, env)?;

        if condition == 0 {
            *pos = stmt_start;
            skip_statement_or_block(input, pos);
            break;
        }

        *pos = stmt_start;
        parse_statement_or_block(input, pos, env)?;
    }

    Ok(())
}

pub fn parse_while_statement(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<bool, String> {
    if !super::check_keyword_match(input, pos, "while ") {
        return Ok(false);
    }
    parse_while_condition_and_statement(input, pos, env)?;
    Ok(true)
}

pub fn parse_block(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(i32, bool), String> {
    // Local scope: new declarations don't leak, but updates to outer vars do.
    let mut local_env = env.clone();
    let mut result = 0i32;
    let mut has_expression = false;

    while *pos < input.len() {
        let rest = &input[*pos..];
        let trimmed = rest.trim_start();
        *pos += rest.len() - trimmed.len();

        if trimmed.is_empty() || trimmed.starts_with('}') {
            break;
        }

        if trimmed.starts_with("let ") {
            *pos += 4;
            super::parse_let_statement(input, pos, &mut local_env)?;
        } else if trimmed.starts_with("if ") {
            parse_if_statement(input, pos, &mut local_env)?;
        } else if trimmed.starts_with("while ") {
            parse_while_statement(input, pos, &mut local_env)?;
        } else if super::parse_assignment_statement(input, pos, &mut local_env)? {
            // assignment handled
        } else {
            result = crate::parser::interpret_at(input, pos, &mut local_env)?;
            has_expression = true;
            break;
        }
    }

    for (var_name, var_info) in local_env.iter() {
        if env.contains_key(var_name) {
            env.insert(var_name.clone(), var_info.clone());
        }
    }

    Ok((result, has_expression))
}
