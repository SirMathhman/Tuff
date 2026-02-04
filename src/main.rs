#[allow(dead_code)]
fn interpret(input: &str) -> Result<i32, String> {
    if input.is_empty() {
        Ok(0)
    } else {
        // Check for leading negative sign
        if input.starts_with('-') {
            return Err("Negative numbers are not allowed".to_string());
        }
        // Find where the alphabetic type suffix starts
        let number_part = input
            .chars()
            .take_while(|c| c.is_numeric())
            .collect::<String>();
        if number_part.is_empty() {
            Ok(0)
        } else {
            number_part
                .parse::<i32>()
                .map_err(|_| "Failed to parse number".to_string())
        }
    }
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_empty_string() {
        assert_eq!(interpret(""), Ok(0));
    }

    #[test]
    fn test_interpret_100() {
        assert_eq!(interpret("100"), Ok(100));
    }

    #[test]
    fn test_interpret_100u8() {
        assert_eq!(interpret("100U8"), Ok(100));
    }

    #[test]
    fn test_interpret_negative_100u8() {
        assert!(interpret("-100U8").is_err());
    }
}
