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

    // Handle 'is' type-check expressions: "1U8 is U8" => 1
    if let Some(is_pos) = source.find(" is ") {
        let left = &source[..is_pos];
        let right = &source[is_pos + 4..].trim();
        
        // Parse the left side to get value and type
        let (_value, value_type) = parse_typed_value(left.trim())?;
        
        // Check if the value's type matches the target type
        let result = if value_type == right.trim() { 1 } else { 0 };
        return Ok(result);
    }

    // Check for type-suffixed instructions: number U8, U16, U32, I8, I16, I32
    if let Ok((value, type_name)) = parse_typed_value(source) {
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

fn parse_typed_value(source: &str) -> Result<(i32, String), String> {
    let source = source.trim();
    
    // Check for type-suffixed value
    for suffix in &["U32", "U16", "U8", "I32", "I16", "I8"] {
        if let Some(pos) = source.find(suffix) {
            let left = source[..pos].trim();
            let value = left.parse::<i32>().map_err(|e| format!("parse error: {}", e))?;
            return Ok((value, suffix.to_string()));
        }
    }
    
    // Plain number
    let value = source.parse::<i32>().map_err(|e| format!("parse error: {}", e))?;
    Ok((value, "I32".to_string()))
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
}

