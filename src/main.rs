use std::io::{self, Write};

type ParsedValue = (i32, String, bool);
type ParseResult<T> = Result<T, String>;

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

fn interpret(source: &str) -> Result<i32, String> {
    interpret_impl(source, true)
}

fn interpret_impl(source: &str, allow_let: bool) -> Result<i32, String> {
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

    // Handle top-level let statements: let y = expr; expr
    if allow_let && let Some(result) = try_parse_let(source) {
        return result;
    }

    // Handle block expressions: { let x = 2 + 3; x } => 5
    if let Some(result) = try_parse_block(source) {
        return result;
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

fn has_arithmetic_op(source: &str) -> bool {
    source.contains(" + ") || source.contains(" - ") || source.contains(" * ")
}

fn try_parse_arithmetic(source: &str) -> Option<Result<i32, String>> {
    let source = source.trim();
    if !has_arithmetic_op(source) {
        return None;
    }

    let src = strip_outer_parens(source);
    if !has_arithmetic_op(src) {
        return None;
    }

    let parts = split_arithmetic(src);
    if parts.len() < 2 {
        return None;
    }

    let reduced = reduce_multiplications(&parts)?;
    let result = eval_add_sub(&reduced)?;
    Some(Ok(result))
}

fn strip_outer_parens(source: &str) -> &str {
    let trimmed = source.trim();
    if (trimmed.starts_with('(') && trimmed.ends_with(')'))
        || (trimmed.starts_with('{') && trimmed.ends_with('}'))
    {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    }
}

fn try_parse_let(source: &str) -> Option<Result<i32, String>> {
    let trimmed = source.trim();
    if !trimmed.starts_with("let ") {
        return None;
    }

    let parts = split_at_semicolons(trimmed);
    if parts.len() < 2 {
        return None;
    }

    let mut vars: Vec<(String, i32, String)> = Vec::new();
    let mut last_result: Option<i32> = None;

    for part in &parts {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }

        if let Some(result) = try_parse_let_binding_typed(part, &vars) {
            match result {
                Ok((var_name, val, var_type)) => {
                    if let Some(existing) = vars.iter_mut().find(|(name, _, _)| *name == var_name) {
                        existing.1 = val;
                        existing.2 = var_type;
                    } else {
                        vars.push((var_name, val, var_type));
                    }
                }
                Err(e) => return Some(Err(e)),
            }
        } else {
            let plain_vars: Vec<(String, i32)> = vars.iter().map(|(n, v, _)| (n.clone(), *v)).collect();
            last_result = Some(interpret_with_vars(part, &plain_vars).ok()?);
        }
    }

    last_result.map(Ok)
}

#[allow(clippy::type_complexity)]
fn parse_let_prefix(source: &str) -> Option<(&str, Option<&str>)> {
    if let Some(eq_pos) = source.find(" = ") {
        let prefix = &source[..eq_pos].trim();
        if let Some(stripped) = prefix.strip_prefix("let ") {
            if let Some(colon_pos) = stripped.find(":") {
                let name = stripped[..colon_pos].trim();
                let typ = stripped[colon_pos + 1..].trim();
                return Some((name, Some(typ)));
            } else {
                return Some((stripped.trim(), None));
            }
        }
    }
    None
}

#[allow(clippy::type_complexity)]
fn try_parse_let_binding_typed(part: &str, vars: &[(String, i32, String)]) -> Option<Result<(String, i32, String), String>> {
    let (var_name, type_name) = parse_let_prefix(part)?;
    let eq_pos = part.find(" = ")?;
    let expr = &part[eq_pos + 3..].trim();

    let plain_vars: Vec<(String, i32)> = vars.iter().map(|(n, v, _)| (n.clone(), *v)).collect();
    let val = match interpret_with_vars(expr, &plain_vars) {
        Ok(v) => v,
        Err(e) => return Some(Err(format!("error evaluating: {}: {}", expr, e))),
    };

    // Determine the expression's type
    let expr_type = if let Ok((_, _, true)) = parse_typed_value(expr) {
        // Plain number: adopt declared type if present, else I32
        type_name.unwrap_or("I32").to_string()
    } else if let Ok((_, t, false)) = parse_typed_value(expr) {
        // Typed literal
        t
    } else {
        // Complex expression: look up variable type from vars
        if let Some(var_ref) = expr.split_whitespace().next() {
            if let Some((_, _, vt)) = vars.iter().find(|(n, _, _)| *n == var_ref) {
                vt.clone()
            } else {
                "I32".to_string()
            }
        } else {
            "I32".to_string()
        }
    };

    // If type annotation is present, use it as the variable's type
    let var_type = type_name.map(|t| t.to_string()).unwrap_or(expr_type.clone());

    // Check type compatibility
    if let Some(declared_type) = type_name {
        if type_width(&expr_type) > type_width(declared_type) {
            return Some(Err(format!("type mismatch: expected {} but got {}", declared_type, expr_type)));
        }
    }

    Some(Ok((var_name.to_string(), val, var_type)))
}

fn split_at_semicolons(source: &str) -> Vec<&str> {
    split_at_depth(source, ';')
}

fn split_at_depth(source: &str, sep: char) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0;
    let mut current_start = 0;
    for (i, ch) in source.char_indices() {
        match ch {
            '(' | '{' => depth += 1,
            ')' | '}' => depth -= 1,
            c if c == sep && depth == 0 => {
                parts.push(&source[current_start..i]);
                current_start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(&source[current_start..]);
    parts
}

fn split_arithmetic(source: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut depth = 0;
    let mut current_start = 0;
    let chars: Vec<char> = source.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        match chars[i] {
            '(' | '{' => depth += 1,
            ')' | '}' => depth -= 1,
            '+' | '-' | '*' if depth == 0 => {
                let seg: String = source[current_start..i].chars().collect();
                parts.push(seg.trim().to_string());
                parts.push(chars[i].to_string());
                current_start = i + 1;
            }
            _ => {}
        }
        i += 1;
    }
    let seg: String = source[current_start..].chars().collect();
    parts.push(seg.trim().to_string());
    parts
}

fn try_parse_block(source: &str) -> Option<Result<i32, String>> {
    let trimmed = source.trim();
    if !trimmed.starts_with('{') || !trimmed.ends_with('}') {
        return None;
    }

    let inner = &trimmed[1..trimmed.len() - 1];
    let statements: Vec<&str> = split_at_semicolons(inner);
    if statements.is_empty() {
        return None;
    }

    let mut vars: Vec<(String, i32)> = Vec::new();
    let mut last_result: Option<i32> = None;

    for stmt in statements {
        let stmt = stmt.trim();
        if stmt.is_empty() {
            continue;
        }

        if let Some(eq_pos) = stmt.find(" = ") {
            let prefix = &stmt[..eq_pos].trim();
            if let Some(stripped) = prefix.strip_prefix("let ") {
                let var_name = stripped.trim();
                let expr = &stmt[eq_pos + 3..].trim();
                if let Ok(val) = interpret_with_vars(expr, &vars) {
                    vars.push((var_name.to_string(), val));
                } else {
                    return Some(Err(format!("error evaluating: {}", expr)));
                }
            } else {
                last_result = Some(interpret_with_vars(stmt, &vars).ok()?);
            }
        } else {
            last_result = Some(interpret_with_vars(stmt, &vars).ok()?);
        }
    }

    last_result.map(Ok)
}

fn interpret_with_vars(source: &str, vars: &[(String, i32)]) -> Result<i32, String> {
    let source = source.trim();

    if source.chars().all(|c| c.is_alphanumeric() || c == '_') {
        for (name, val) in vars {
            if *name == source {
                return Ok(*val);
            }
        }
    }

    interpret_impl(source, false)
}

fn reduce_multiplications(parts: &[String]) -> Option<Vec<String>> {
    let mut reduced: Vec<String> = Vec::new();
    let mut i = 0;
    while i < parts.len() {
        if parts[i] == "*" {
            let left = interpret_impl(parts[i - 1].trim(), false).ok()?;
            let right = interpret_impl(parts[i + 1].trim(), false).ok()?;
            *reduced.last_mut().unwrap() = (left * right).to_string();
            i += 2;
        } else {
            reduced.push(parts[i].clone());
            i += 1;
        }
    }
    Some(reduced)
}

fn eval_add_sub(parts: &[String]) -> Option<i32> {
    let mut result = interpret_impl(parts[0].trim(), false).ok()?;
    let mut i = 1;
    while i < parts.len() {
        let op = &parts[i];
        let next = interpret_impl(parts[i + 1].trim(), false).ok()?;
        if op == "+" {
            result += next;
        } else if op == "-" {
            result -= next;
        }
        i += 2;
    }
    Some(result)
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

fn eval_arithmetic(source: &str) -> ParseResult<(i32, String)> {
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

fn parse_typed_value(source: &str) -> ParseResult<ParsedValue> {
    let source = source.trim();
    
    // Handle boolean literals
    if source == "true" {
        return Ok((1, "Bool".to_string(), false));
    }
    if source == "false" {
        return Ok((0, "Bool".to_string(), false));
    }
    
    // Skip block expressions - they can't be parsed as typed values
    if source.starts_with('{') {
        return Err("cannot parse block as typed value".to_string());
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

    #[test]
    fn test_mul_add_precedence() {
        assert_eq!(interpret("2 * 3 + 4"), Ok(10));
    }

    #[test]
    fn test_add_mul_precedence() {
        assert_eq!(interpret("2 + 3 * 4"), Ok(14));
    }

    #[test]
    fn test_paren_mul() {
        assert_eq!(interpret("(2 + 3) * 4"), Ok(20));
    }

    #[test]
    fn test_block_let_mul() {
        assert_eq!(interpret("{ let x = 2 + 3; x } * 4"), Ok(20));
    }

    #[test]
    fn test_top_level_let() {
        assert_eq!(interpret("let y = { let x = 2 + 3; x } * 4; y"), Ok(20));
    }

    #[test]
    fn test_let_shadowing() {
        assert_eq!(interpret("let x = 0; let x = 1; x"), Ok(1));
    }

    #[test]
    fn test_typed_let() {
        assert_eq!(interpret("let x : U16 = 100U8; x"), Ok(100));
    }

    #[test]
    fn test_typed_let_var_mismatch() {
        assert_eq!(interpret("let x = 100U16; let y : U8 = x; y"), Err(String::from("type mismatch: expected U8 but got U16")));
    }
}

