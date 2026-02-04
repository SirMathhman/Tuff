#[allow(dead_code)]
fn interpret(_source: String) -> i32 {
    0
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_empty_string() {
        assert_eq!(interpret("".to_string()), 0);
    }
}
