// Feel free to change param type if required
fn interpret_tuff(source: &str) -> Result<i64, String> {
    let source = source.trim();
    if source.is_empty() {
        return Ok(0);
    }

    let suffixes = ["U8", "U16", "U32", "I8", "I16", "I32"];
    for suffix in suffixes {
        if let Some(num_str) = source.strip_suffix(suffix) {
            if let Ok(num) = num_str.parse::<i64>() {
                if suffix.starts_with("U") && num < 0 {
                    return Err(format!("negative value {} not allowed for {}", num, suffix));
                }
                match suffix {
                    "U8" if num > 255 => return Err(format!("value {} out of range for U8", num)),
                    "U16" if num > 65535 => {
                        return Err(format!("value {} out of range for U16", num));
                    }
                    "U32" if num > 4294967295 => {
                        return Err(format!("value {} out of range for U32", num));
                    }
                    "I8" if num < -128 || num > 127 => {
                        return Err(format!("value {} out of range for I8", num));
                    }
                    "I16" if num < -32768 || num > 32767 => {
                        return Err(format!("value {} out of range for I16", num));
                    }
                    "I32" if num < -2147483648 || num > 2147483647 => {
                        return Err(format!("value {} out of range for I32", num));
                    }
                    _ => {}
                }
                return Ok(num);
            }
        }
    }

    Err("no valid suffix found".to_string())
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_tuff_empty_string() {
        assert_eq!(interpret_tuff(""), Ok(0));
    }

    #[test]
    fn test_interpret_tuff_whitespace() {
        assert_eq!(interpret_tuff("   "), Ok(0));
        assert_eq!(interpret_tuff("\t"), Ok(0));
        assert_eq!(interpret_tuff("\n"), Ok(0));
    }

    #[test]
    fn test_interpret_tuff_number_u8() {
        assert_eq!(interpret_tuff("100U8"), Ok(100));
    }

    #[test]
    fn test_interpret_tuff_number_u16() {
        assert_eq!(interpret_tuff("100U16"), Ok(100));
    }

    #[test]
    fn test_interpret_tuff_number_u32() {
        assert_eq!(interpret_tuff("100U32"), Ok(100));
    }

    #[test]
    fn test_interpret_tuff_negative_u32() {
        assert!(interpret_tuff("-100U32").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_u8() {
        assert!(interpret_tuff("256U8").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_u16() {
        assert!(interpret_tuff("65536U16").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_u32() {
        assert!(interpret_tuff("4294967296U32").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_i8() {
        assert!(interpret_tuff("128I8").is_err());
        assert!(interpret_tuff("-129I8").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_i16() {
        assert!(interpret_tuff("32768I16").is_err());
        assert!(interpret_tuff("-32769I16").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_i32() {
        assert!(interpret_tuff("2147483648I32").is_err());
        assert!(interpret_tuff("-2147483649I32").is_err());
    }
}
