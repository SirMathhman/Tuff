fn main() {
    println!("Hello, world!");
}

pub fn interpret(input: &str) -> i64 {
    if input.is_empty() {
        0
    } else {
        unimplemented!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string_is_zero() {
        assert_eq!(interpret(""), 0);
    }
}
