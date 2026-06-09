fn interpret_tuff(input: &str) -> Result<i64, String> {
    if input.is_empty() {
        return Ok(0);
    }
    Err("invalid input".to_string())
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string() {
        assert_eq!(interpret_tuff("").unwrap(), 0);
    }

    #[test]
    fn test_invalid_input_returns_error() {
        assert!(interpret_tuff("invalid").is_err());
    }
}
