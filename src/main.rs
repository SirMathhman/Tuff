fn interpret_tuff(source: &str) -> i64 {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return 0;
    }

    // Strip type suffix (e.g., U8, U16, I32, etc.)
    let num_str = if let Some(stripped) = trimmed.strip_suffix("U8") {
        stripped
    } else if let Some(stripped) = trimmed.strip_suffix("U16") {
        stripped
    } else if let Some(stripped) = trimmed.strip_suffix("U32") {
        stripped
    } else if let Some(stripped) = trimmed.strip_suffix("U64") {
        stripped
    } else if let Some(stripped) = trimmed.strip_suffix("I8") {
        stripped
    } else if let Some(stripped) = trimmed.strip_suffix("I16") {
        stripped
    } else if let Some(stripped) = trimmed.strip_suffix("I32") {
        stripped
    } else if let Some(stripped) = trimmed.strip_suffix("I64") {
        stripped
    } else {
        trimmed
    };

    num_str.parse::<i64>().unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string_returns_zero() {
        assert_eq!(interpret_tuff(""), 0);
    }

    #[test]
    fn test_whitespace_returns_zero() {
        assert_eq!(interpret_tuff("   "), 0);
    }

    #[test]
    fn test_literal_number() {
        assert_eq!(interpret_tuff("100"), 100);
    }

    #[test]
    fn test_u8_literal() {
        assert_eq!(interpret_tuff("100U8"), 100);
    }

    #[test]
    fn test_u16_literal() {
        assert_eq!(interpret_tuff("100U16"), 100);
    }
}

fn main() {
    println!("Hello, world!");
}
