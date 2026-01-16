use crate::parse_utils::{parse_number_with_type, skip_whitespace};
use crate::variables::Environment;

fn parse_match_case(input: &str, pos: &mut usize) -> Result<(i32, bool), String> {
    skip_whitespace(input, pos);

    let trimmed = input[*pos..].trim_start();
    let is_wildcard = trimmed.starts_with('_');

    let pattern_value = if is_wildcard {
        *pos += input[*pos..].len() - trimmed.len() + 1;
        -1
    } else {
        let (value, _, len) = parse_number_with_type(&input[*pos..])?;
        *pos += len;
        value
    };

    skip_whitespace(input, pos);

    let trimmed = input[*pos..].trim_start();
    if !trimmed.starts_with("=>") {
        return Err("Expected '=>' after pattern in match case".to_string());
    }
    *pos += input[*pos..].len() - trimmed.len() + 2;

    Ok((pattern_value, is_wildcard))
}

pub fn parse_match_expression(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(i32, String), String> {
    let scrutinee = super::parse_paren_expression(input, pos, env)
        .map_err(|_| "Expected '(' after 'match'".to_string())?;

    skip_whitespace(input, pos);
    if !input[*pos..].trim_start().starts_with('{') {
        return Err("Expected '{' after match scrutinee".to_string());
    }
    *pos += input[*pos..].len() - input[*pos..].trim_start().len() + 1;

    let mut matched = false;
    let mut result = 0;

    loop {
        skip_whitespace(input, pos);

        if input[*pos..].trim_start().starts_with('}') {
            *pos += input[*pos..].len() - input[*pos..].trim_start().len() + 1;
            break;
        }

        let trimmed = input[*pos..].trim_start();
        if !trimmed.starts_with("case") {
            return Err("Expected 'case' in match expression".to_string());
        }
        *pos += input[*pos..].len() - trimmed.len() + 4;

        let (pattern_value, is_wildcard) = parse_match_case(input, pos)?;

        skip_whitespace(input, pos);
        let case_value = super::interpret_at(input, pos, env)?;

        if !matched && (is_wildcard || pattern_value == scrutinee) {
            result = case_value;
            matched = true;
        }

        skip_whitespace(input, pos);
        let trimmed = input[*pos..].trim_start();
        if !trimmed.starts_with(';') {
            return Err("Expected ';' after match case value".to_string());
        }
        *pos += input[*pos..].len() - trimmed.len() + 1;
    }

    if !matched {
        return Err("No matching case in match expression".to_string());
    }

    Ok((result, "".to_string()))
}
