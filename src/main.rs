fn execute_tuff(input: &str) -> Result<u64, String> {
    if input.is_empty() {
        return Ok(0);
    }

    let num_str = input
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>();

    if num_str.is_empty() {
        return Err(format!("invalid literal: {input}"));
    }

    let value = num_str
        .parse::<u64>()
        .map_err(|e| format!("{e}: {input}"))?;

    if value > u8::MAX as u64 {
        return Err(format!("value out of range for U8: {value}"));
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
}
