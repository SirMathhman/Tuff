use crate::parse_utils::{parse_identifier, skip_whitespace};

#[allow(clippy::too_many_lines)]
pub fn read_type_name_after_colon(input: &str, pos: &mut usize) -> Result<String, String> {
    skip_whitespace(input, pos);
    let rest = &input[*pos..];

    let mut pointer_prefix = String::new();
    let mut prefix_pos = 0;
    while prefix_pos < rest.len() && rest.chars().nth(prefix_pos).is_some_and(|c| c == '*') {
        pointer_prefix.push('*');
        prefix_pos += 1;
    }

    let rest_after_ptrs = rest[prefix_pos..].trim_start();
    let ptr_ws_offset = rest[prefix_pos..].len() - rest_after_ptrs.len();
    let base_offset = prefix_pos + ptr_ws_offset;

    // Check for function pointer type: (Type, Type) => ReturnType
    if rest_after_ptrs.starts_with('(') {
        let mut type_str = String::new();
        let mut depth = 0;
        let mut temp_pos = 0;

        while temp_pos < rest_after_ptrs.len() {
            let c = rest_after_ptrs
                .chars()
                .nth(temp_pos)
                .ok_or("Invalid character in type")?;

            if c == '(' {
                depth += 1;
                type_str.push(c);
            } else if c == ')' {
                depth -= 1;
                type_str.push(c);
                temp_pos += 1;
                break;
            } else {
                type_str.push(c);
            }
            temp_pos += 1;
        }

        if depth != 0 {
            return Err("Unmatched parentheses in function type".to_string());
        }

        skip_whitespace(&rest_after_ptrs[temp_pos..], &mut 0);
        let remaining = &rest_after_ptrs[temp_pos..].trim_start();

        if remaining.starts_with("=>") {
            type_str.push_str(" => ");
            temp_pos += rest_after_ptrs[temp_pos..].len() - remaining.len() + 2;

            let (return_type, return_len) = parse_identifier(&rest_after_ptrs[temp_pos..])?;
            type_str.push_str(&return_type);
            temp_pos += return_len;

            *pos += base_offset + temp_pos;
            return Ok(format!("{}{}", pointer_prefix, type_str));
        }

        Err("Expected '=>' in function type".to_string())
    } else {
        // Regular type with optional pointers
        let (type_name, len) = parse_identifier(rest_after_ptrs)?;
        *pos += base_offset + len;
        Ok(format!("{}{}", pointer_prefix, type_name))
    }
}

pub fn parse_type_annotation_optional(
    input: &str,
    pos: &mut usize,
) -> Result<Option<String>, String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();

    if !trimmed.starts_with(':') {
        return Ok(None);
    }

    let ws_offset = rest.len() - trimmed.len();
    *pos += ws_offset + 1;

    let type_name = read_type_name_after_colon(input, pos)?;
    Ok(Some(type_name))
}
