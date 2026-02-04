#[allow(dead_code)]
fn interpret(input: &str) -> i32 {
    if input.is_empty() {
        0
    } else {
        // Find where the alphabetic type suffix starts
        let number_part = input.chars().take_while(|c| c.is_numeric()).collect::<String>();
        if number_part.is_empty() {
            0
        } else {
            number_part.parse().unwrap_or(0)
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
        assert_eq!(interpret(""), 0);
    }

    #[test]
    fn test_interpret_100() {
        assert_eq!(interpret("100"), 100);
    }

    #[test]
    fn test_interpret_100u8() {
        assert_eq!(interpret("100U8"), 100);
    }
}
