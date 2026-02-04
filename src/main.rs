#[allow(dead_code)]
fn interpret(input: &str) -> i32 {
    if input.is_empty() {
        0
    } else {
        todo!()
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
}
