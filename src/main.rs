fn main() {
    println!("Hello, world!");
}

#[allow(dead_code)]
fn evaluate(input: &str) -> i64 {
    if input.is_empty() {
        return 0;
    }
    let mut tokens = input.split(|c| c == '+' || c == '-');
    let mut result = tokens.next().map(|t| t.trim().parse::<i64>().unwrap_or(0)).unwrap_or(0);
    let ops: Vec<char> = input.chars().filter(|c| *c == '+' || *c == '-').collect();
    for (_i, op) in ops.iter().enumerate() {
        let val = tokens.next().map(|t| t.trim().parse::<i64>().unwrap_or(0)).unwrap_or(0);
        if *op == '+' {
            result += val;
        } else {
            result -= val;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evaluate_empty_string() {
        assert_eq!(evaluate(""), 0);
    }

    #[test]
    fn test_evaluate_one() {
        assert_eq!(evaluate("1"), 1);
    }

    #[test]
    fn test_evaluate_addition() {
        assert_eq!(evaluate("1 + 2"), 3);
    }

    #[test]
    fn test_evaluate_chained_addition() {
        assert_eq!(evaluate("1 + 2 + 3"), 6);
    }

    #[test]
    fn test_evaluate_addition_subtraction() {
        assert_eq!(evaluate("2 + 3 - 1"), 4);
    }
}
