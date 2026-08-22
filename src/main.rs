fn main() {
    println!("Hello, world!");
}

pub fn evaluate(input: &str) -> i64 {
    let mut parser = Parser::new(input);
    parser.parse_expr()
}

struct Parser {
    chars: Vec<char>,
    pos: usize,
}

impl Parser {
    fn new(input: &str) -> Self {
        Self {
            chars: input.chars().collect(),
            pos: 0,
        }
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn skip_whitespace(&mut self) {
        while matches!(self.peek(), Some(c) if c.is_whitespace()) {
            self.pos += 1;
        }
    }

    fn parse_expr(&mut self) -> i64 {
        let mut value = self.parse_number();
        loop {
            self.skip_whitespace();
            match self.peek() {
                Some('+') => {
                    self.pos += 1;
                    value += self.parse_number();
                }
                _ => break,
            }
        }
        value
    }

    fn parse_number(&mut self) -> i64 {
        self.skip_whitespace();
        let start = self.pos;
        while matches!(self.peek(), Some(c) if c.is_ascii_digit()) {
            self.pos += 1;
        }
        if start == self.pos {
            return 0;
        }
        let digits: String = self.chars[start..self.pos].iter().collect();
        digits.parse().unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string_evaluates_to_zero() {
        assert_eq!(evaluate(""), 0);
    }

    #[test]
    fn one_evaluates_to_one() {
        assert_eq!(evaluate("1"), 1);
    }

    #[test]
    fn one_plus_two_evaluates_to_three() {
        assert_eq!(evaluate("1 + 2"), 3);
    }
}
