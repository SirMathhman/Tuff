fn interpret(source: String) -> i32 {
    if source.is_empty() {
        return 0;
    }

    source.parse::<i32>().unwrap_or(0)
}

fn main() {
    // REPL For interpret, read from stdin and print the result
    use std::io::{self, Write};

    let mut input = String::new();
    loop {
        print!(">>> ");
        io::stdout().flush().unwrap();
        input.clear();
        if io::stdin().read_line(&mut input).is_err() {
            break;
        }
        let result = interpret(input.trim().to_string());
        println!("{}", result);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_empty_string() {
        assert_eq!(interpret("".to_string()), 0);
    }

    #[test]
    fn test_interpret_number() {
        assert_eq!(interpret("100".to_string()), 100);
    }
}
