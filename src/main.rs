#[allow(dead_code)]
fn interpret(input: &str) -> Result<i32, String> {
    let has_u8_suffix = input.ends_with("U8") || input.ends_with("u8");
    
    let trimmed = input
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>();

    if trimmed.is_empty() {
        Err("No digits found".to_string())
    } else {
        let value = trimmed.parse::<i32>().map_err(|e| e.to_string())?;
        
        if has_u8_suffix && !(0..=255).contains(&value) {
            Err("Value out of range for U8".to_string())
        } else {
            Ok(value)
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

    #[test]
    fn test_interpret_256u8() {
        assert!(interpret("256U8").is_err());
    }
}
