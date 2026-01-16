use crate::parse_utils::skip_whitespace;
use crate::variables::Environment;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum LoopControl {
    None,
    Break,
    Continue,
}

// Thread-local storage for loop control signals
thread_local! {
    static LOOP_CONTROL: std::cell::RefCell<LoopControl> = const { std::cell::RefCell::new(LoopControl::None) };
}

#[allow(dead_code)]
pub fn set_loop_control(ctrl: LoopControl) {
    LOOP_CONTROL.with(|lc| *lc.borrow_mut() = ctrl);
}

#[allow(dead_code)]
pub fn get_loop_control() -> LoopControl {
    LOOP_CONTROL.with(|lc| *lc.borrow())
}

#[allow(dead_code)]
pub fn clear_loop_control() {
    LOOP_CONTROL.with(|lc| *lc.borrow_mut() = LoopControl::None);
}

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

fn parse_statement_inner(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(), String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();

    if trimmed.starts_with("let ") {
        *pos += rest.len() - trimmed.len() + 4;
        super::parse_let_statement(input, pos, env)?;
    } else if trimmed.starts_with("break") {
        consume_break_or_continue_keyword("break", input, pos, LoopControl::Break)?;
    } else if trimmed.starts_with("continue") {
        consume_break_or_continue_keyword("continue", input, pos, LoopControl::Continue)?;
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
        // Try to parse as a statement
        let rest = &input[*pos..];
        let trimmed = rest.trim_start();
        
        if trimmed.starts_with("let ") || trimmed.starts_with("break") || trimmed.starts_with("continue") {
            parse_statement_inner(input, pos, env)?;
            Ok(())
        } else if super::parse_assignment_statement(input, pos, env)? {
            Ok(())
        } else {
            // If it's not a statement, try to parse as an expression
            let _ = parse_expression_in_block(input, pos, env)?;
            Ok(())
        }
    }
}

fn skip_single_statement(input: &str, pos: &mut usize) {
    skip_whitespace(input, pos);
    while *pos < input.len() && input.as_bytes()[*pos] != b';' && input.as_bytes()[*pos] != b'}' {
        *pos += 1;
    }
    if *pos < input.len() && input.as_bytes()[*pos] == b';' {
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

fn is_else_boundary(trimmed: &str) -> bool {
    if !trimmed.starts_with("else") {
        return false;
    }
    let after = trimmed.get(4..).and_then(|s| s.chars().next());
    match after {
        None => true,
        Some(ch) => !ch.is_alphanumeric() && ch != '_',
    }
}

fn parse_expression_in_block(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i32, String> {
    let result = crate::parser::interpret_at(input, pos, env)?;
    skip_whitespace(input, pos);
    if *pos < input.len() && input.as_bytes()[*pos] == b';' {
        *pos += 1;
    }
    Ok(result)
}

#[allow(clippy::too_many_lines)]
fn if_has_else(input: &str, pos: usize) -> Result<bool, String> {
    let mut scan_pos = pos;
    let rest = &input[scan_pos..];
    let trimmed = rest.trim_start();
    scan_pos += rest.len() - trimmed.len();

    if !trimmed.starts_with("if") {
        return Ok(false);
    }

    scan_pos += 2;
    skip_whitespace(input, &mut scan_pos);

    let trimmed = input[scan_pos..].trim_start();
    if !trimmed.starts_with('(') {
        return Err("Expected '(' after 'if'".to_string());
    }
    scan_pos += input[scan_pos..].len() - trimmed.len() + 1;

    let mut paren_depth = 1;
    while scan_pos < input.len() && paren_depth > 0 {
        match input.as_bytes()[scan_pos] {
            b'(' => paren_depth += 1,
            b')' => paren_depth -= 1,
            _ => {}
        }
        scan_pos += 1;
    }

    if paren_depth != 0 {
        return Err("Mismatched parentheses in if condition".to_string());
    }

    skip_whitespace(input, &mut scan_pos);
    let trimmed = input[scan_pos..].trim_start();
    scan_pos += input[scan_pos..].len() - trimmed.len();

    if trimmed.starts_with('{') {
        let mut brace_depth = 1;
        scan_pos += 1;
        while scan_pos < input.len() && brace_depth > 0 {
            match input.as_bytes()[scan_pos] {
                b'{' => brace_depth += 1,
                b'}' => brace_depth -= 1,
                _ => {}
            }
            scan_pos += 1;
        }
        if brace_depth != 0 {
            return Err("Missing closing '}' in if branch".to_string());
        }

        skip_whitespace(input, &mut scan_pos);
        let trimmed = input[scan_pos..].trim_start();
        if is_else_boundary(trimmed) {
            return Ok(true);
        }
        return Ok(false);
    }

    let mut paren_depth = 0usize;
    let mut brace_depth = 0usize;
    while scan_pos < input.len() {
        let b = input.as_bytes()[scan_pos];
        match b {
            b'(' => paren_depth += 1,
            b')' => {
                paren_depth = paren_depth.saturating_sub(1);
            }
            b'{' => brace_depth += 1,
            b'}' => {
                if brace_depth == 0 && paren_depth == 0 {
                    return Ok(false);
                }
                brace_depth = brace_depth.saturating_sub(1);
            }
            b';' => {
                if brace_depth == 0 && paren_depth == 0 {
                    return Ok(false);
                }
            }
            _ => {}
        }

        if brace_depth == 0 && paren_depth == 0 {
            let remaining = &input[scan_pos..];
            let trimmed = remaining.trim_start();
            if is_else_boundary(trimmed) {
                return Ok(true);
            }
        }

        scan_pos += 1;
    }

    Ok(false)
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

    clear_loop_control();
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

        if handle_loop_control() {
            break;
        }
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

fn skip_to_closing_brace(input: &str, pos: &mut usize) {
    while *pos < input.len() && !input[*pos..].trim_start().starts_with('}') {
        *pos += 1;
    }
}

pub fn consume_break_or_continue_keyword(
    keyword: &str,
    input: &str,
    pos: &mut usize,
    control: LoopControl,
) -> Result<(), String> {
    let rest = &input[*pos..];
    let len = keyword.len();
    *pos += rest.len() - rest.trim_start().len() + len;
    skip_whitespace(input, pos);
    if input[*pos..].trim_start().starts_with(';') {
        *pos += 1;
    }
    set_loop_control(control);
    Ok(())
}

fn handle_loop_control() -> bool {
    let ctrl = get_loop_control();
    match ctrl {
        LoopControl::Break => {
            clear_loop_control();
            true
        }
        LoopControl::Continue => {
            clear_loop_control();
            false
        }
        LoopControl::None => false,
    }
}

#[allow(clippy::too_many_lines)]
fn parse_local_function_definition(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(), String> {
    // Parse a local function definition and store it in the environment as a closure
    use crate::variables::LocalFunction;
    use crate::functions::parse_complete_function;

    let rest = &input[*pos..];
    let trimmed = rest.trim_start();

    if !trimmed.starts_with("fn ") {
        return Ok(());
    }

    let start_pos = *pos + rest.len() - trimmed.len();
    *pos = start_pos;

    // Parse complete function
    let (func_name, params, return_type, body) = parse_complete_function(input, pos)?;

    // Create the VariableInfo for the function
    let var_info = crate::variables::VariableInfo {
        value: None,
        type_name: "fn".to_string(),
        is_mutable: false,
        points_to: None,
        struct_fields: None,
        function_name: None,
        local_function: None, // Will be set after insertion
        methods: None,
    };

    // Insert placeholder first
    env.insert(func_name.clone(), var_info);

    // Now create the local function with environment that includes itself
    let local_func = LocalFunction {
        params,
        return_type,
        body,
        captured_env: env.clone(), // Now this includes the function itself!
    };

    // Update with the actual function
    env.insert(
        func_name.clone(),
        crate::variables::VariableInfo {
            value: None,
            type_name: "fn".to_string(),
            is_mutable: false,
            points_to: None,
            struct_fields: None,
            function_name: None,
            local_function: Some(Box::new(local_func)),
            methods: None,
        },
    );
    
    Ok(())
}


#[allow(clippy::too_many_lines)]
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
        } else if trimmed.starts_with("fn ") {
            parse_local_function_definition(input, pos, &mut local_env)?;
        } else if trimmed.starts_with("if ") {
            if if_has_else(input, *pos)? {
                result = parse_expression_in_block(input, pos, &mut local_env)?;
                has_expression = true;
                break;
            } else {
                let parsed = parse_if_statement(input, pos, &mut local_env)?;
                if !parsed {
                    return Err("Expected 'if' statement".to_string());
                }
                if get_loop_control() != LoopControl::None {
                    skip_to_closing_brace(input, pos);
                    break;
                }
            }
        } else if trimmed.starts_with("while ") {
            parse_while_statement(input, pos, &mut local_env)?;
            if get_loop_control() != LoopControl::None {
                skip_to_closing_brace(input, pos);
                break;
            }
        } else if trimmed.starts_with("for ") {
            parse_for_statement(input, pos, &mut local_env)?;
            if get_loop_control() != LoopControl::None {
                skip_to_closing_brace(input, pos);
                break;
            }
        } else if trimmed.starts_with("break") {
            consume_break_or_continue_keyword("break", input, pos, LoopControl::Break)?;
            break;
        } else if trimmed.starts_with("continue") {
            consume_break_or_continue_keyword("continue", input, pos, LoopControl::Continue)?;
            break;
        } else if super::parse_assignment_statement(input, pos, &mut local_env)? {
            if get_loop_control() != LoopControl::None {
                skip_to_closing_brace(input, pos);
                break;
            }
        } else {
            result = parse_expression_in_block(input, pos, &mut local_env)?;
            has_expression = true;
            break;
        }
    }

    for (var_name, var_info) in local_env.iter() {
        if env.contains_key(var_name) {
            env.insert(var_name.clone(), var_info.clone());
        } else if var_name.starts_with("_struct_inst_") {
            // Temporary struct variables created by `this` keyword should be propagated
            env.insert(var_name.clone(), var_info.clone());
        }
    }

    Ok((result, has_expression))
}

pub fn parse_for_statement(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<bool, String> {
    if !super::check_keyword_match(input, pos, "for ") {
        return Ok(false);
    }
    parse_for_condition_and_statement(input, pos, env)?;
    Ok(true)
}

#[allow(clippy::too_many_lines)]
fn parse_for_condition_and_statement(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(), String> {
    consume_required_char(input, pos, '(', "Expected '(' after 'for'")?;

    // Parse: let i in START..END
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();

    if !trimmed.starts_with("let ") {
        return Err("Expected 'let' in for loop".to_string());
    }
    *pos += rest.len() - trimmed.len() + 4;

    let (loop_var, var_len) = crate::parse_utils::parse_identifier(&input[*pos..])?;
    *pos += var_len;

    skip_whitespace(input, pos);
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    if !trimmed.starts_with("in ") {
        return Err("Expected 'in' after loop variable".to_string());
    }
    *pos += rest.len() - trimmed.len() + 3;

    // Parse start..end range using a minimal environment for expressions
    let (start, _) = crate::parser::parse_term_with_type(input, pos, env)?;

    skip_whitespace(input, pos);
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    if !trimmed.starts_with("..") {
        return Err("Expected '..' for range".to_string());
    }
    *pos += rest.len() - trimmed.len() + 2;

    let (end, _) = crate::parser::parse_term_with_type(input, pos, env)?;

    consume_required_char(input, pos, ')', "Expected ')' after range")?;

    // Remember where the body starts
    let body_start = *pos;

    // Execute the loop
    clear_loop_control();
    for i in start..end {
        // Create/update loop variable with I32 type
        let var_info = crate::variables::VariableInfo {
            value: Some(i),
            type_name: "I32".to_string(),
            is_mutable: false,
            points_to: None,
            struct_fields: None,
            function_name: None,
            local_function: None,
            methods: None,
        };
        env.insert(loop_var.clone(), var_info);

        // Reset position to body start for each iteration
        *pos = body_start;

        // Execute body statement
        parse_statement_or_block(input, pos, env)?;

        if handle_loop_control() {
            break;
        }
    }

    Ok(())
}
