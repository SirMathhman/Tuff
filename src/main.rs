fn main() {
    println!("Hello, world!");
}

#[allow(dead_code)]
fn evaluate(input: &str) -> i64 {
    if input.is_empty() {
        return 0;
    }

    // Tokenize into numbers and operators
    let raw_tokens: Vec<&str> = input.split_whitespace().collect();
    let mut values: Vec<i64> = Vec::new();
    let mut ops: Vec<char> = Vec::new();

    for (i, token) in raw_tokens.iter().enumerate() {
        if i % 2 == 0 {
            values.push(token.parse::<i64>().unwrap_or(0));
        } else {
            ops.push(token.chars().next().unwrap());
        }
    }

    // First pass: handle * and /
    let mut new_values: Vec<i64> = Vec::new();
    let mut new_ops: Vec<char> = Vec::new();
    let mut current = values[0];
    for (i, op) in ops.iter().enumerate() {
        if *op == '*' || *op == '/' {
            let next = values[i + 1];
            if *op == '*' {
                current *= next;
            } else {
                current /= next;
            }
        } else {
            new_values.push(current);
            new_ops.push(*op);
            current = values[i + 1];
        }
    }
    new_values.push(current);

    // Second pass: handle + and -
    let mut result = new_values[0];
    for (i, op) in new_ops.iter().enumerate() {
        if *op == '+' {
            result += new_values[i + 1];
        } else {
            result -= new_values[i + 1];
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

    #[test]
    fn test_evaluate_multiplication_addition() {
        assert_eq!(evaluate("2 * 3 + 4"), 10);
    }
}
