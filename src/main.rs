fn parse_suffix(input: &str) -> String {
    input.chars().skip_while(|c| c.is_ascii_digit()).collect()
}

fn max_for_suffix(suffix: &str) -> Option<u64> {
    match suffix.to_uppercase().as_str() {
        "U8" => Some(u8::MAX as u64),
        "U16" => Some(u16::MAX as u64),
        "U32" => Some(u32::MAX as u64),
        "U64" => Some(u64::MAX),
        _ => None,
    }
}

fn execute_tuff(input: &str) -> Result<u64, String> {
    if input.is_empty() {
        return Ok(0);
    }

    let num_str: String = input.chars().take_while(|c| c.is_ascii_digit()).collect();

    if num_str.is_empty() {
        return Err(format!("invalid literal: {input}"));
    }

    let value = num_str
        .parse::<u64>()
        .map_err(|e| format!("{e}: {input}"))?;

    let suffix = parse_suffix(input);
    let max = max_for_suffix(&suffix).ok_or_else(|| format!("unknown suffix: {suffix}"))?;

    if value > max {
        return Err(format!("value out of range for {suffix}: {value}"));
    }

    Ok(value)
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string_returns_zero() {
        assert_eq!(execute_tuff(""), Ok(0));
    }

    #[test]
    fn single_u8_returns_value() {
        assert_eq!(execute_tuff("1U8"), Ok(1));
    }

    #[test]
    fn negative_u8_returns_err() {
        assert!(execute_tuff("-1U8").is_err());
    }

    #[test]
    fn u8_overflow_returns_err() {
        assert!(execute_tuff("256U8").is_err());
    }

    #[test]
    fn u16_within_range_returns_value() {
        assert_eq!(execute_tuff("256U16"), Ok(256));
    }
}
