#[cfg(not(test))]
fn main() {
    // TODO: REPL for interpret_tuff
}

fn interpret_tuff(source: &str) -> i64 {
    let mut trimmed = source.trim().to_string();
    if trimmed.is_empty() {
        return 0;
    }

    // Recursively evaluate parenthesized sub-expressions first
    while let Some((open, close)) = find_matching_paren(&trimmed) {
        let inner = &trimmed[open + 1..close];
        let val = interpret_tuff(inner);
        trimmed = format!("{} {} {}", &trimmed[..open], val, &trimmed[close + 1..]);
    }

    // Split into operands and operators, preserving order
    let operands: Vec<&str> = trimmed.split(|c| "+-*/".contains(c)).collect();
    let ops: Vec<char> = trimmed.chars().filter(|&c| "+-*/".contains(c)).collect();

    let values: Vec<i64> = operands
        .iter()
        .map(|s| s.trim().parse::<i64>().unwrap_or(0))
        .collect();

    // Pass 1: resolve * and / (higher precedence) in-place
    let mut resolved: Vec<i64> = vec![values[0]];
    for i in 0..ops.len() {
        match ops[i] {
            '*' => *resolved.last_mut().unwrap() *= values[i + 1],
            '/' => *resolved.last_mut().unwrap() /= values[i + 1],
            '+' | '-' => resolved.push(values[i + 1]),
            _ => {}
        }
    }

    // Pass 2: resolve remaining + and - left to right
    let add_sub_ops: Vec<char> = ops
        .iter()
        .filter(|&&op| op == '+' || op == '-')
        .copied()
        .collect();
    let mut result = resolved[0];
    for (idx, &op) in add_sub_ops.iter().enumerate() {
        match op {
            '+' => result += resolved[idx + 1],
            '-' => result -= resolved[idx + 1],
            _ => {}
        }
    }

    result
}

/// Find the innermost matching pair of parentheses and return (open_pos, close_pos).
fn find_matching_paren(s: &str) -> Option<(usize, usize)> {
    let mut depth = 0;
    let mut open_pos = None;
    for (i, c) in s.chars().enumerate() {
        match c {
            '(' => {
                if depth == 0 {
                    open_pos = Some(i);
                }
                depth += 1;
            }
            ')' => {
                depth -= 1;
                if depth == 0 && open_pos.is_some() {
                    return Some((open_pos.unwrap(), i));
                }
            }
            _ => {}
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_returns_zero() {
        assert_eq!(interpret_tuff(""), 0);
    }

    #[test]
    fn whitespace_only_returns_zero() {
        assert_eq!(interpret_tuff(" "), 0);
    }

    #[test]
    fn literal_one_returns_one() {
        assert_eq!(interpret_tuff("1"), 1);
    }

    #[test]
    fn addition_expression() {
        assert_eq!(interpret_tuff("1 + 2"), 3);
    }

    #[test]
    fn chained_addition() {
        assert_eq!(interpret_tuff("1 + 2 + 3"), 6);
    }

    #[test]
    fn mixed_add_subtract() {
        assert_eq!(interpret_tuff("1 + 2 - 3"), 0);
    }

    #[test]
    fn multiplication_with_subtraction() {
        assert_eq!(interpret_tuff("1 * 2 - 3"), -1);
    }

    #[test]
    fn division_expression() {
        assert_eq!(interpret_tuff("10 / 5"), 2);
    }

    #[test]
    fn mixed_multiplication_division_addition() {
        assert_eq!(interpret_tuff("3 * 4 + 6 / 2 - 5"), 10);
    }

    #[test]
    fn single_negative_result() {
        assert_eq!(interpret_tuff("0 - 7"), -7);
    }

    #[test]
    fn large_expression() {
        assert_eq!(interpret_tuff("1 + 2 * 3 / 4 - 5 + 6 * 7"), 39);
    }

    #[test]
    fn parenthesized_expression() {
        assert_eq!(interpret_tuff("3 * (4 + 5)"), 27);
    }
}
