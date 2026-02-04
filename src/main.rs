fn interpret(source: String) -> Result<i32, String> {
    if source.is_empty() {
        return Ok(0);
    }

    // Extract the numeric part: optional minus sign followed by digits
    let mut numeric_part = String::new();
    let mut chars = source.chars().peekable();
    let mut has_minus = false;

    // Handle optional leading minus sign
    if let Some(&'-') = chars.peek() {
        has_minus = true;
        chars.next();
    }

    // Add digits until we hit a non-digit
    while let Some(&c) = chars.peek() {
        if c.is_ascii_digit() {
            numeric_part.push(c);
            chars.next();
        } else {
            break;
        }
    }

    if numeric_part.is_empty() {
        return Err("No digits found".to_string());
    }

    // Collect the type suffix
    let type_suffix: String = chars.collect();

    // Validate: unsigned types (U8, U16, U32, U64) cannot be negative
    if has_minus && !type_suffix.is_empty() {
        let type_suffix_upper = type_suffix.to_uppercase();
        if type_suffix_upper.starts_with('U') {
            return Err(format!(
                "Negative value for unsigned type: -{}{}",
                numeric_part, type_suffix
            ));
        }
    }

    // Parse the numeric value
    match numeric_part.parse::<i32>() {
        Ok(num) => {
            let value = if has_minus { -num } else { num };
            Ok(value)
        }
        Err(_) => Err(format!("Failed to parse number: {}", numeric_part)),
    }
}

fn main() {
    // REPL For interpret, read from stdin and print the result
    use std::io::{self, Write};

    let mut input = String::new();
    loop {
        print!(">>> ");
        let _ = io::stdout().flush();
        input.clear();
        if io::stdin().read_line(&mut input).is_err() {
            break;
        }
        match interpret(input.trim().to_string()) {
            Ok(result) => println!("{}", result),
            Err(e) => println!("Error: {}", e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_empty_string() {
        assert_eq!(interpret("".to_string()), Ok(0));
    }

    #[test]
    fn test_interpret_number() {
        assert_eq!(interpret("100".to_string()), Ok(100));
    }

    #[test]
    fn test_interpret_typed_number() {
        assert_eq!(interpret("100U8".to_string()), Ok(100));
    }

    #[test]
    fn test_interpret_negative_unsigned_fails() {
        assert!(interpret("-100U8".to_string()).is_err());
    }
}
