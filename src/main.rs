use std::io::{self, Write};

fn main() {
    println!("Tuff REPL (type 'quit' to exit)");
    let stdin = io::stdin();
    loop {
        print!("> ");
        io::stdout().flush().unwrap();

        let mut input = String::new();
        if stdin.read_line(&mut input).unwrap_or(0) == 0 {
            break;
        }
        let input = input.trim();
        if input == "quit" || input == "exit" {
            break;
        }
        if input.is_empty() {
            continue;
        }

        match interpret(input) {
            Ok(result) => println!("{}", result),
            Err(e) => println!("Error: {}", e),
        }
    }
}

fn interpret(source : &str) -> Result<i32, String> {
    let source = source.trim();
    if source.is_empty() {
        return Ok(0);
    }

    // Handle boolean literals
    if source == "true" {
        return Ok(1);
    }
    if source == "false" {
        return Ok(0);
    }

    // Handle arithmetic expressions: "1U8 + 2U8" => 3, "2 + 3 - 4" => 1
    if let Some(result) = try_parse_arithmetic(source) {
        return result;
    }

    // Handle 'is' type-check expressions: "1U8 is U8" => 1
    if let Some(is_pos) = source.find(" is ") {
        let left = &source[..is_pos];
        let right = &source[is_pos + 4..].trim();
        
        // Parse the left side to get value and type
        let (_value, value_type, _) = parse_typed_value(left.trim())?;
        
        // Check if the value's type matches the target type
        let result = if value_type == right.trim() { 1 } else { 0 };
        return Ok(result);
    }

    // Check for type-suffixed instructions: number U8, U16, U32, I8, I16, I32
    if let Ok((value, type_name, _)) = parse_typed_value(source) {
        let (min, max) = match type_name.as_str() {
            "U8"  => (0, 255),
            "U16" => (0, 65535),
            "U32" => (0, i32::MAX),
            "I8"  => (-128, 127),
            "I16" => (-32768, 32767),
            "I32" => (i32::MIN, i32::MAX),
            _     => return Err(format!("unknown type: {}", type_name)),
        };

        if value < min || value > max {
            return Err(format!("value {} out of range for {} ({})", value, type_name, min.to_string() + "-" + &max.to_string()));
        }
        return Ok(value);
    }

    source.parse().map_err(|e| format!("parse error: {}", e))
}

fn try_parse_arithmetic(source: &str) -> Option<Result<i32, String>> {
    let source = source.trim();
    if !source.contains(" + ") && !source.contains(" - ") {
        return None;
    }
    
    // Strip outer parentheses if present
    let src = if source.starts_with('(') && source.ends_with(')') {
        &source[1..source.len() - 1]
    } else {
        source
    };
    
    if !src.contains(" + ") && !src.contains(" - ") {
        return None;
    }
    
    let parts = split_arithmetic(src);
    if parts.len() < 2 {
        return None;
    }
    
    let mut result = interpret(parts[0].trim()).ok()?;
    let mut i = 1;
    while i < parts.len() {
        let op = &parts[i];
        let next = interpret(parts[i + 1].trim()).ok()?;
        if op == "+" {
            result += next;
        } else if op == "-" {
            result -= next;
        }
        i += 2;
    }
    Some(Ok(result))
}

fn type_width(type_name: &str) -> u32 {
    match type_name {
        "Bool" => 0,
        "U8" | "I8" => 8,
        "U16" | "I16" => 16,
        "U32" | "I32" => 32,
        _ => 32,
    }
}

fn is_signed(type_name: &str) -> bool {
    type_name.starts_with('I')
}

fn infer_result_type(operands: &[(i32, String, bool)]) -> (u32, bool) {
    let mut widest = 0u32;
    let mut has_signed = false;
    let mut has_unsigned = false;

    for (_, typ, is_plain) in operands {
        if *is_plain {
            continue;
        }
        let w = type_width(typ);
        widest = widest.max(w);
        if is_signed(typ) {
            has_signed = true;
        } else if typ != "Bool" {
            has_unsigned = true;
        }
    }

    // If mixing signed and unsigned at same width, promote to next wider signed type
    if has_signed && has_unsigned {
        match widest {
            0 => (0, true),
            8 => (16, true),
            16 => (32, true),
            32 => (32, true),
            _ => (32, true),
        }
    } else {
        (widest, has_signed)
    }
}

fn width_to_type(width: u32, signed: bool) -> String {
    match (width, signed) {
        (0, _) => "Bool".to_string(),
        (8, false) => "U8".to_string(),
        (8, true)  => "I8".to_string(),
        (16, false) => "U16".to_string(),
        (16, true)  => "I16".to_string(),
        (32, false) => "U32".to_string(),
        (32, true)  => "I32".to_string(),
        _ => "I32".to_string(),
    }
}

fn split_arithmetic(source: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut depth = 0;
    let mut current_start = 0;
    for (i, ch) in source.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => depth -= 1,
            '+' if depth == 0 => {
                parts.push(source[current_start..i].trim().to_string());
                parts.push("+".to_string());
                current_start = i + 1;
            }
            '-' if depth == 0 => {
                parts.push(source[current_start..i].trim().to_string());
                parts.push("-".to_string());
                current_start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(source[current_start..].trim().to_string());
    parts
}

fn eval_arithmetic(source: &str) -> Result<(i32, String), String> {
    let parts = split_arithmetic(source);
    
    // First pass: collect types for promotion
    let mut operands: Vec<(i32, String, bool)> = Vec::new();
    let mut i = 0;
    while i < parts.len() {
        let (val, typ, is_plain) = parse_typed_value(&parts[i])?;
        operands.push((val, typ, is_plain));
        i += 2;
    }
    
    // Determine result type
    let (final_width, final_signed) = infer_result_type(&operands);
    
    // Second pass: evaluate
    let mut result = operands[0].0;
    i = 1;
    while i < parts.len() {
        let op = &parts[i];
        let next = operands[i / 2].0;
        if op == "+" {
            result += next;
        } else if op == "-" {
            result -= next;
        }
        i += 2;
    }
    
    Ok((result, width_to_type(final_width, final_signed)))
}

fn parse_typed_value(source: &str) -> Result<(i32, String, bool), String> {
    let source = source.trim();
    
    // Handle boolean literals
    if source == "true" {
        return Ok((1, "Bool".to_string(), false));
    }
    if source == "false" {
        return Ok((0, "Bool".to_string(), false));
    }
    
    // Strip outer parentheses if present, then try to parse inner content
    let inner = if source.starts_with('(') && source.ends_with(')') {
        &source[1..source.len() - 1]
    } else {
        source
    };
    
    // If inner content contains an addition expression, evaluate and infer type
    if inner.contains(" + ") || inner.contains(" - ") {
        let (val, typ) = eval_arithmetic(inner)?;
        return Ok((val, typ, false));
    }
    
    // Check for type-suffixed value
    for suffix in &["U32", "U16", "U8", "I32", "I16", "I8"] {
        if let Some(pos) = inner.find(suffix) {
            let left = inner[..pos].trim();
            let value = left.parse::<i32>().map_err(|e| format!("parse error: {}", e))?;
            return Ok((value, suffix.to_string(), false));
        }
    }
    
    // Plain number
    let value = source.parse::<i32>().map_err(|e| format!("parse error: {}", e))?;
    Ok((value, "I32".to_string(), true))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_input() {
        assert_eq!(interpret(""), Ok(0));
    }

    #[test]
    fn test_whitespace_input() {
        assert_eq!(interpret(" "), Ok(0));
    }

    #[test]
    fn test_numeric_input() {
        assert_eq!(interpret("1"), Ok(1));
    }

    #[test]
    fn test_u_instruction() {
        assert_eq!(interpret("1U8"), Ok(1));
    }

    #[test]
    fn test_u_instruction_overflow() {
        assert!(interpret("256U8").is_err());
    }

    #[test]
    fn test_u_instruction_negative() {
        assert!(interpret("-1U8").is_err());
    }

    #[test]
    fn test_true_literal() {
        assert_eq!(interpret("true"), Ok(1));
    }

    #[test]
    fn test_is_type_check() {
        assert_eq!(interpret("1U8 is U8"), Ok(1));
    }

    #[test]
    fn test_is_type_check_mismatch() {
        assert_eq!(interpret("1U8 is U16"), Ok(0));
    }

    #[test]
    fn test_is_plain_number_i32() {
        assert_eq!(interpret("1 is I32"), Ok(1));
    }

    #[test]
    fn test_is_bool() {
        assert_eq!(interpret("true is Bool"), Ok(1));
    }

    #[test]
    fn test_addition() {
        assert_eq!(interpret("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn test_multi_addition() {
        assert_eq!(interpret("1U8 + 2U8 + 3U8"), Ok(6));
    }

    #[test]
    fn test_paren_addition() {
        assert_eq!(interpret("(1U8 + 2U8) + 3U8"), Ok(6));
    }

    #[test]
    fn test_paren_is_type_check() {
        assert_eq!(interpret("(1U8) is U8"), Ok(1));
    }

    #[test]
    fn test_addition_expr_is_type_check() {
        assert_eq!(interpret("(1U8 + 2U8) is U8"), Ok(1));
    }

    #[test]
    fn test_mixed_type_addition_is_type_check() {
        assert_eq!(interpret("(1U8 + 2U16) is U16"), Ok(1));
    }

    #[test]
    fn test_mixed_signed_unsigned_addition() {
        assert_eq!(interpret("(1U8 + 2I8) is I16"), Ok(1));
    }

    #[test]
    fn test_add_sub() {
        assert_eq!(interpret("2 + 3 - 4"), Ok(1));
    }

    #[test]
    fn test_typed_plus_plain_is_type() {
        assert_eq!(interpret("(1U8 + 1) is U8"), Ok(1));
    }
}

