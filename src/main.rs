#[allow(dead_code)]
fn interpret(input: &str) -> Result<i32, String> {
    let trimmed = input
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>();
    
    if trimmed.is_empty() {
        Err("No digits found".to_string())
    } else {
        trimmed.parse::<i32>().map_err(|e| e.to_string())
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
}
