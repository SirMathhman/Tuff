fn main() {
    println!("Hello, world!");
}

fn interpret(source : &str) -> i32 {
    if source.is_empty() {
        return 0;
    }
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_input() {
        assert_eq!(interpret(""), 0);
    }
}

