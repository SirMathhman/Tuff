fn main() {
    println!("Hello, world!");
}

fn interpret(source : &str) -> Result<i32, String> {
    let source = source.trim();
    if source.is_empty() {
        return Ok(0);
    }

    // Check for type-suffixed instructions: number U8, U16, U32, I8, I16, I32
    for suffix in &["U32", "U16", "U8", "I32", "I16", "I8"] {
        if let Some(pos) = source.find(suffix) {
            let left = source[..pos].trim();
            let value = left.parse::<i32>().map_err(|e| format!("parse error: {}", e))?;

            let (min, max) = match *suffix {
                "U8"  => (0, 255),
                "U16" => (0, 65535),
                "U32" => (0, i32::MAX),
                "I8"  => (-128, 127),
                "I16" => (-32768, 32767),
                "I32" => (i32::MIN, i32::MAX),
                _     => return Err(format!("unknown type: {}", suffix)),
            };

            if value < min || value > max {
                return Err(format!("value {} out of range for {} ({})", value, suffix, min.to_string() + "-" + &max.to_string()));
            }
            return Ok(value);
        }
    }

    source.parse().map_err(|e| format!("parse error: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_input() {
        assert_eq!(interpret(""), Ok(0));
    }

    #[test]
    fn test_whitespace_input() {
        assert_eq!(interpret(" "), Ok(0));
    }

    #[test]
    fn test_numeric_input() {
        assert_eq!(interpret("1"), Ok(1));
    }

    #[test]
    fn test_u_instruction() {
        assert_eq!(interpret("1U8"), Ok(1));
    }

    #[test]
    fn test_u_instruction_overflow() {
        assert!(interpret("256U8").is_err());
    }

    #[test]
    fn test_u_instruction_negative() {
        assert!(interpret("-1U8").is_err());
    }
}

