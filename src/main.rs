fn main() {}

fn execute_tuff(input: &str) -> u64 {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return 0;
    }

    // Parse TUIR values like "100U8", "255U16", etc.
    if let Some((value_str, _suffix)) = parse_tuir_value(trimmed) {
        return value_str.parse::<u64>().unwrap_or(0);
    }

    0
}

/// Parse a TUIR-formatted value string like "100U8" into (numeric_part, type_suffix).
fn parse_tuir_value(input: &str) -> Option<(&str, &str)> {
    let suffixes = ["U64", "U32", "U16", "U8"];
    for suffix in &suffixes {
        if input.ends_with(suffix) {
            return Some((&input[..input.len() - suffix.len()], suffix));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_tuff_empty_string_returns_zero() {
        assert_eq!(execute_tuff(""), 0);
    }

    #[test]
    fn test_execute_tuff_whitespace_returns_zero() {
        assert_eq!(execute_tuff("   "), 0);
        assert_eq!(execute_tuff("\t\n"), 0);
        assert_eq!(execute_tuff(" \t \n "), 0);
    }

    #[test]
    fn test_execute_tuff_100u8_returns_100() {
        assert_eq!(execute_tuff("100U8"), 100);
    }
}
