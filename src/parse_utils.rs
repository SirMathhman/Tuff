use crate::validators::validate_type_range;

pub fn parse_number_inner(input: &str) -> Result<(i64, String, usize), String> {
    let trimmed = input.trim_start();
    let ws_offset = input.len() - trimmed.len();
    let digit_end = trimmed
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(trimmed.len());
    if digit_end == 0 {
        return Err("No digits found".to_string());
    }
    let digit_str = &trimmed[..digit_end];
    let value = digit_str.parse::<i64>().map_err(|e| e.to_string())?;
    let remainder = &trimmed[digit_end..];
    let suffix_end = remainder
        .find(|c: char| !c.is_alphanumeric())
        .unwrap_or(remainder.len());
    let suffix = &remainder[..suffix_end];
    let suffix_upper = suffix.to_uppercase();
    Ok((value, suffix_upper, ws_offset + digit_end + suffix_end))
}

pub fn parse_number_with_type(input: &str) -> Result<(i32, String, usize), String> {
    let (value, suffix_upper, len) = parse_number_inner(input)?;
    let result = validate_type_range(&suffix_upper, value)?;
    Ok((result, suffix_upper, len))
}

pub fn parse_identifier(input: &str) -> Result<(String, usize), String> {
    let trimmed = input.trim_start();
    let ws_offset = input.len() - trimmed.len();

    let end = trimmed
        .find(|c: char| !c.is_alphanumeric() && c != '_')
        .unwrap_or(trimmed.len());

    if end == 0 {
        return Err("No identifier found".to_string());
    }

    let ident = trimmed[..end].to_string();
    Ok((ident, ws_offset + end))
}

pub fn skip_whitespace(input: &str, pos: &mut usize) {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    *pos += rest.len() - trimmed.len();
}

pub fn check_and_consume_op(input: &str, pos: &mut usize, ops: &str) -> Option<char> {
    let trimmed = input[*pos..].trim_start();
    let ws_len = input[*pos..].len() - trimmed.len();

    if let Some(op) = trimmed.chars().next() {
        if ops.contains(op) {
            *pos += ws_len + 1;
            return Some(op);
        }
    }
    None
}
