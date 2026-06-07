fn execute_tuff(input: &str) -> Result<i32, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }

    // Parse strings like "100U8" by extracting the numeric prefix before 'U'/'u'.
    match trimmed.find(|c| c == 'U' || c == 'u') {
        Some(pos) => {
            let value_str = &trimmed[..pos];
            if value_str.is_empty() {
                return Err(format!("invalid input: {}", input));
            }
            // Reject negative values for unsigned types (e.g., "-100U8").
            if value_str.starts_with('-') {
                return Err(format!("negative value not allowed: {}", input));
            }

            let value = value_str
                .parse::<i32>()
                .map_err(|_| format!("invalid number: {}", input))?;

            // Extract and validate the type suffix (e.g., "8", "16", "32").
            let suffix = &trimmed[pos + 1..];
            if !suffix.is_empty() {
                match suffix.parse::<u32>() {
                    Ok(bits) => {
                        let max_val = (1u64 << bits).wrapping_sub(1);
                        if value as u64 > max_val || value < 0 {
                            return Err(format!("value out of range for U{}: {}", bits, input));
                        }
                    }
                    Err(_) => {
                        return Err(format!("invalid type suffix in: {}", input));
                    }
                }
            }

            Ok(value)
        }
        None => trimmed
            .parse::<i32>()
            .map_err(|_| format!("invalid number: {}", input)),
    }
}

use std::io::{self, BufRead, Write};

fn main() {
    let stdin = io::stdin();
    loop {
        print!("> ");
        io::stdout().flush().unwrap();

        let mut input = String::new();
        match stdin.lock().read_line(&mut input) {
            Ok(0) => break, // EOF
            Ok(_) => {
                let trimmed = input.trim();
                if trimmed.is_empty() {
                    continue;
                }
                match execute_tuff(trimmed) {
                    Ok(value) => println!("{}", value),
                    Err(e) => eprintln!("Error: {}", e),
                }
            }
            Err(_) => break,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_tuff_empty_string() {
        assert_eq!(execute_tuff(""), Ok(0));
    }

    #[test]
    fn test_execute_tuff_whitespace() {
        assert_eq!(execute_tuff("   "), Ok(0));
    }

    #[test]
    fn test_execute_tuff_100u8() {
        assert_eq!(execute_tuff("100U8"), Ok(100));
    }

    #[test]
    fn test_execute_tuff_negative_u8_error() {
        assert!(execute_tuff("-100U8").is_err());
    }

    #[test]
    fn test_execute_tuff_256u8_overflow_error() {
        assert!(execute_tuff("256U8").is_err());
    }
}
