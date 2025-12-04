// Lexer Module (Stub)

use crate::compiler::Span;

#[derive(Debug, Clone, PartialEq)]
pub enum TokenKind {
    // Keywords
    Fn,
    Let,
    Mut,
    Type,
    Match,
    If,
    Else,
    Loop,
    Return,
    Extern,
    True,
    False,
    Void,

    // Identifiers and Literals
    Ident(String),
    Number(String),
    String(String),

    // Operators
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
    Equal,
    EqualEqual,
    NotEqual,
    Less,
    Greater,
    LessEqual,
    GreaterEqual,
    And,
    Or,
    Not,
    Ampersand,
    Dot,

    // Delimiters
    LeftParen,
    RightParen,
    LeftBrace,
    RightBrace,
    LeftBracket,
    RightBracket,
    Comma,
    Colon,
    Semicolon,
    Arrow,
    Pipe,

    // Special
    Eof,
    Unknown(char),
}

#[derive(Debug, Clone)]
pub struct Token {
    pub kind: TokenKind,
    pub span: Span,
}

pub struct Lexer {
    input: Vec<char>,
    position: usize,
    line: usize,
    column: usize,
    filename: String,
}

impl Lexer {
    pub fn new(input: &str, filename: impl Into<String>) -> Self {
        Lexer {
            input: input.chars().collect(),
            position: 0,
            line: 1,
            column: 1,
            filename: filename.into(),
        }
    }

    pub fn tokenize(&mut self) -> Vec<Token> {
        let mut tokens = Vec::new();
        while !self.is_at_end() {
            self.skip_whitespace_and_comments();
            if !self.is_at_end() {
                tokens.push(self.next_token());
            }
        }
        tokens.push(Token {
            kind: TokenKind::Eof,
            span: Span::new(&self.filename, self.line, self.column, 1),
        });
        tokens
    }

    fn next_token(&mut self) -> Token {
        let start_line = self.line;
        let start_column = self.column;
        let ch = self.current();

        let (kind, length) = match ch {
            '+' => { self.advance(); (TokenKind::Plus, 1) }
            '-' => {
                self.advance();
                if self.current() == '>' {
                    self.advance();
                    (TokenKind::Arrow, 2)
                } else {
                    (TokenKind::Minus, 1)
                }
            }
            '*' => { self.advance(); (TokenKind::Star, 1) }
            '/' => { self.advance(); (TokenKind::Slash, 1) }
            '%' => { self.advance(); (TokenKind::Percent, 1) }
            '=' => {
                self.advance();
                if self.current() == '=' {
                    self.advance();
                    (TokenKind::EqualEqual, 2)
                } else {
                    (TokenKind::Equal, 1)
                }
            }
            '!' => {
                self.advance();
                if self.current() == '=' {
                    self.advance();
                    (TokenKind::NotEqual, 2)
                } else {
                    (TokenKind::Not, 1)
                }
            }
            '<' => {
                self.advance();
                if self.current() == '=' {
                    self.advance();
                    (TokenKind::LessEqual, 2)
                } else {
                    (TokenKind::Less, 1)
                }
            }
            '>' => {
                self.advance();
                if self.current() == '=' {
                    self.advance();
                    (TokenKind::GreaterEqual, 2)
                } else {
                    (TokenKind::Greater, 1)
                }
            }
            '&' => {
                self.advance();
                if self.current() == '&' {
                    self.advance();
                    (TokenKind::And, 2)
                } else {
                    (TokenKind::Ampersand, 1)
                }
            }
            '|' => {
                self.advance();
                if self.current() == '|' {
                    self.advance();
                    (TokenKind::Or, 2)
                } else {
                    (TokenKind::Pipe, 1)
                }
            }
            '.' => { self.advance(); (TokenKind::Dot, 1) }
            '(' => { self.advance(); (TokenKind::LeftParen, 1) }
            ')' => { self.advance(); (TokenKind::RightParen, 1) }
            '{' => { self.advance(); (TokenKind::LeftBrace, 1) }
            '}' => { self.advance(); (TokenKind::RightBrace, 1) }
            '[' => { self.advance(); (TokenKind::LeftBracket, 1) }
            ']' => { self.advance(); (TokenKind::RightBracket, 1) }
            ',' => { self.advance(); (TokenKind::Comma, 1) }
            ':' => { self.advance(); (TokenKind::Colon, 1) }
            ';' => { self.advance(); (TokenKind::Semicolon, 1) }
            '"' => self.read_string_token(),
            _ if ch.is_alphabetic() || ch == '_' => self.read_identifier_token(),
            _ if ch.is_numeric() => self.read_number_token(),
            _ => {
                self.advance();
                (TokenKind::Unknown(ch), 1)
            }
        };

        Token {
            kind,
            span: Span::new(&self.filename, start_line, start_column, length),
        }
    }

    fn read_identifier(&mut self) -> TokenKind {
        let start = self.position;
        while !self.is_at_end() && (self.current().is_alphanumeric() || self.current() == '_') {
            self.advance();
        }
        let ident = self.input[start..self.position].iter().collect::<String>();

        match ident.as_str() {
            "fn" => TokenKind::Fn,
            "let" => TokenKind::Let,
            "mut" => TokenKind::Mut,
            "type" => TokenKind::Type,
            "match" => TokenKind::Match,
            "if" => TokenKind::If,
            "else" => TokenKind::Else,
            "loop" => TokenKind::Loop,
            "return" => TokenKind::Return,
            "extern" => TokenKind::Extern,
            "true" => TokenKind::True,
            "false" => TokenKind::False,
            "void" => TokenKind::Void,
            _ => TokenKind::Ident(ident),
        }
    }

    fn read_identifier_token(&mut self) -> (TokenKind, usize) {
        let start_pos = self.position;
        let kind = self.read_identifier();
        let length = self.position - start_pos;
        (kind, length)
    }

    fn read_number(&mut self) -> TokenKind {
        let start = self.position;
        while !self.is_at_end() && self.current().is_numeric() {
            self.advance();
        }
        let num = self.input[start..self.position].iter().collect::<String>();
        TokenKind::Number(num)
    }

    fn read_number_token(&mut self) -> (TokenKind, usize) {
        let start_pos = self.position;
        let kind = self.read_number();
        let length = self.position - start_pos;
        (kind, length)
    }

    fn read_string(&mut self) -> TokenKind {
        self.advance(); // consume opening quote
        let start = self.position;
        while !self.is_at_end() && self.current() != '"' {
            if self.current() == '\\' {
                self.advance();
                self.advance();
            } else {
                self.advance();
            }
        }
        let string = self.input[start..self.position].iter().collect::<String>();
        if !self.is_at_end() {
            self.advance(); // consume closing quote
        }
        TokenKind::String(string)
    }

    fn read_string_token(&mut self) -> (TokenKind, usize) {
        let start_pos = self.position;
        let kind = self.read_string();
        let length = self.position - start_pos;
        (kind, length)
    }

    fn skip_whitespace_and_comments(&mut self) {
        while !self.is_at_end() {
            match self.current() {
                ' ' | '\t' | '\r' => self.advance(),
                '\n' => {
                    self.advance();
                    self.line += 1;
                    self.column = 1;
                }
                '/' if self.peek() == Some('/') => {
                    self.advance();
                    self.advance();
                    while !self.is_at_end() && self.current() != '\n' {
                        self.advance();
                    }
                }
                _ => break,
            }
        }
    }

    fn current(&self) -> char {
        if self.is_at_end() {
            '\0'
        } else {
            self.input[self.position]
        }
    }

    fn peek(&self) -> Option<char> {
        if self.position + 1 < self.input.len() {
            Some(self.input[self.position + 1])
        } else {
            None
        }
    }

    fn advance(&mut self) {
        if !self.is_at_end() {
            self.position += 1;
            self.column += 1;
        }
    }

    fn is_at_end(&self) -> bool {
        self.position >= self.input.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tokenize_simple() {
        let mut lexer = Lexer::new("let x = 42;", "test.tuff");
        let tokens = lexer.tokenize();
        assert!(tokens.len() > 0);
        assert_eq!(tokens[0].kind, TokenKind::Let);
        assert_eq!(tokens[1].kind, TokenKind::Ident("x".to_string()));
        assert_eq!(tokens[2].kind, TokenKind::Equal);
        assert_eq!(tokens[3].kind, TokenKind::Number("42".to_string()));
        assert_eq!(tokens[4].kind, TokenKind::Semicolon);
    }

    #[test]
    fn test_tokenize_keywords() {
        let mut lexer = Lexer::new("fn let mut type match if else loop return extern true false void", "test.tuff");
        let tokens = lexer.tokenize();
        assert_eq!(tokens[0].kind, TokenKind::Fn);
        assert_eq!(tokens[1].kind, TokenKind::Let);
        assert_eq!(tokens[2].kind, TokenKind::Mut);
        assert_eq!(tokens[3].kind, TokenKind::Type);
        assert_eq!(tokens[4].kind, TokenKind::Match);
        assert_eq!(tokens[5].kind, TokenKind::If);
        assert_eq!(tokens[6].kind, TokenKind::Else);
        assert_eq!(tokens[7].kind, TokenKind::Loop);
        assert_eq!(tokens[8].kind, TokenKind::Return);
        assert_eq!(tokens[9].kind, TokenKind::Extern);
        assert_eq!(tokens[10].kind, TokenKind::True);
        assert_eq!(tokens[11].kind, TokenKind::False);
        assert_eq!(tokens[12].kind, TokenKind::Void);
    }

    #[test]
    fn test_tokenize_operators() {
        let mut lexer = Lexer::new("+ - * / % == != < > <= >= && || !", "test.tuff");
        let tokens = lexer.tokenize();
        assert_eq!(tokens[0].kind, TokenKind::Plus);
        assert_eq!(tokens[1].kind, TokenKind::Minus);
        assert_eq!(tokens[2].kind, TokenKind::Star);
        assert_eq!(tokens[3].kind, TokenKind::Slash);
        assert_eq!(tokens[4].kind, TokenKind::Percent);
        assert_eq!(tokens[5].kind, TokenKind::EqualEqual);
        assert_eq!(tokens[6].kind, TokenKind::NotEqual);
        assert_eq!(tokens[7].kind, TokenKind::Less);
        assert_eq!(tokens[8].kind, TokenKind::Greater);
        assert_eq!(tokens[9].kind, TokenKind::LessEqual);
        assert_eq!(tokens[10].kind, TokenKind::GreaterEqual);
        assert_eq!(tokens[11].kind, TokenKind::And);
        assert_eq!(tokens[12].kind, TokenKind::Or);
        assert_eq!(tokens[13].kind, TokenKind::Not);
    }

    #[test]
    fn test_tokenize_delimiters() {
        let mut lexer = Lexer::new("( ) { } [ ] , : ; -> |", "test.tuff");
        let tokens = lexer.tokenize();
        assert_eq!(tokens[0].kind, TokenKind::LeftParen);
        assert_eq!(tokens[1].kind, TokenKind::RightParen);
        assert_eq!(tokens[2].kind, TokenKind::LeftBrace);
        assert_eq!(tokens[3].kind, TokenKind::RightBrace);
        assert_eq!(tokens[4].kind, TokenKind::LeftBracket);
        assert_eq!(tokens[5].kind, TokenKind::RightBracket);
        assert_eq!(tokens[6].kind, TokenKind::Comma);
        assert_eq!(tokens[7].kind, TokenKind::Colon);
        assert_eq!(tokens[8].kind, TokenKind::Semicolon);
        assert_eq!(tokens[9].kind, TokenKind::Arrow);
        assert_eq!(tokens[10].kind, TokenKind::Pipe);
    }

    #[test]
    fn test_tokenize_string() {
        let mut lexer = Lexer::new(r#""hello world""#, "test.tuff");
        let tokens = lexer.tokenize();
        match &tokens[0].kind {
            TokenKind::String(s) => assert_eq!(s, "hello world"),
            _ => panic!("Expected string token"),
        }
    }

    #[test]
    fn test_tokenize_comments() {
        let mut lexer = Lexer::new("let x = 42; // comment\nlet y = 1;", "test.tuff");
        let tokens = lexer.tokenize();
        // Comments should be skipped
        assert_eq!(tokens[0].kind, TokenKind::Let);
        assert_eq!(tokens[1].kind, TokenKind::Ident("x".to_string()));
    }

    #[test]
    fn test_span_tracking() {
        let mut lexer = Lexer::new("let x = 42;", "test.tuff");
        let tokens = lexer.tokenize();
        
        // First token "let" should be at line 1, column 1
        assert_eq!(tokens[0].span.line, 1);
        assert_eq!(tokens[0].span.column, 1);
        
        // "let" has length 3
        assert_eq!(tokens[0].span.length, 3);
        
        // "=" should be at line 1, column 7 (after "let x ")
        assert_eq!(tokens[2].span.line, 1);
        assert_eq!(tokens[2].span.column, 7);
    }

    #[test]
    fn test_multiline_tracking() {
        let mut lexer = Lexer::new("let x = 42;\nlet y = 1;", "test.tuff");
        let tokens = lexer.tokenize();
        
        // First "let" at line 1
        assert_eq!(tokens[0].span.line, 1);
        
        // Second "let" at line 2
        // Tokens: let x = 42 ; let
        // The second "let" should be at index 5
        assert_eq!(tokens[5].span.line, 2);
    }

    #[test]
    fn test_ownership_markers() {
        let mut lexer = Lexer::new("&x &mut y", "test.tuff");
        let tokens = lexer.tokenize();
        assert_eq!(tokens[0].kind, TokenKind::Ampersand);
        assert_eq!(tokens[1].kind, TokenKind::Ident("x".to_string()));
        assert_eq!(tokens[2].kind, TokenKind::Ampersand);
        assert_eq!(tokens[3].kind, TokenKind::Mut);
        assert_eq!(tokens[4].kind, TokenKind::Ident("y".to_string()));
    }

    #[test]
    fn test_function_definition() {
        let mut lexer = Lexer::new("fn add(x: i32, y: i32) -> i32 { x + y }", "test.tuff");
        let tokens = lexer.tokenize();
        assert_eq!(tokens[0].kind, TokenKind::Fn);
        assert_eq!(tokens[1].kind, TokenKind::Ident("add".to_string()));
        assert_eq!(tokens[2].kind, TokenKind::LeftParen);
    }
}
