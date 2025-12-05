#[derive(Debug, Clone, PartialEq)]
pub enum Expr {
    // Literals
    Number(f64),
    String(String),
    Boolean(bool),
    Null,

    // Variables and identifiers
    Identifier(String),

    // Binary operations
    Binary {
        left: Box<Expr>,
        op: BinOp,
        right: Box<Expr>,
    },

    // Unary operations
    Unary {
        op: UnaryOp,
        operand: Box<Expr>,
    },

    // Function call
    Call {
        func: Box<Expr>,
        args: Vec<Expr>,
    },

    // Array
    Array(Vec<Expr>),

    // Array/object indexing
    Index {
        object: Box<Expr>,
        index: Box<Expr>,
    },

    // Ternary conditional
    Ternary {
        condition: Box<Expr>,
        then_expr: Box<Expr>,
        else_expr: Box<Expr>,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub enum BinOp {
    Add,
    Subtract,
    Multiply,
    Divide,
    Modulo,
    Equal,
    NotEqual,
    Less,
    LessEqual,
    Greater,
    GreaterEqual,
    And,
    Or,
}

#[derive(Debug, Clone, PartialEq)]
pub enum UnaryOp {
    Negate,
    Not,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Stmt {
    // Expression statement
    Expression(Expr),

    // Assignment: x = 5;
    Assign {
        name: String,
        value: Expr,
    },

    // Variable declaration: let x = 5;
    Let {
        name: String,
        value: Option<Expr>,
    },

    // Function declaration
    Function {
        name: String,
        params: Vec<String>,
        body: Vec<Stmt>,
    },

    // If statement
    If {
        condition: Expr,
        then_body: Vec<Stmt>,
        else_body: Option<Vec<Stmt>>,
    },

    // While loop
    While {
        condition: Expr,
        body: Vec<Stmt>,
    },

    // For loop
    For {
        var: String,
        iter: Expr,
        body: Vec<Stmt>,
    },

    // Return statement
    Return(Option<Expr>),

    // Block (for scoping)
    Block(Vec<Stmt>),
}

#[derive(Debug)]
pub struct Program {
    pub statements: Vec<Stmt>,
}
