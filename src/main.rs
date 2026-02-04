fn interpret(source: String) -> i32 {
    if source.is_empty() {
        return 0;
    }

    // Extract the numeric part: optional minus sign followed by digits
    let mut numeric_part = String::new();
    let mut chars = source.chars();

    // Handle optional leading minus sign
    if let Some(first) = chars.next() {
        if first == '-' {
            numeric_part.push('-');
        } else if first.is_ascii_digit() {
            numeric_part.push(first);
        } else {
            return 0;
        }
    }

    // Add remaining digits until we hit a non-digit
    for c in chars {
        if c.is_ascii_digit() {
            numeric_part.push(c);
        } else {
            break;
        }
    }

    numeric_part.parse::<i32>().unwrap_or(0)
}

fn main() {
    // REPL For interpret, read from stdin and print the result
    use std::io::{self, Write};

    let mut input = String::new();
    loop {
        print!(">>> ");
        io::stdout().flush().unwrap();
        input.clear();
        if io::stdin().read_line(&mut input).is_err() {
            break;
        }
        let result = interpret(input.trim().to_string());
        println!("{}", result);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_empty_string() {
        assert_eq!(interpret("".to_string()), 0);
    }

    #[test]
    fn test_interpret_number() {
        assert_eq!(interpret("100".to_string()), 100);
    }

    #[test]
    fn test_interpret_typed_number() {
        assert_eq!(interpret("100U8".to_string()), 100);
    }
}
