#[derive(Debug, Clone, PartialEq)]
pub enum Type {
    // Primitives
    U8,
    U16,
    U32,
    U64,
    I8,
    I16,
    I32,
    I64,
    F32,
    F64,
    Bool,
    Char,
    String,
    Void,

    // Pointers and references
    Reference(Box<Type>),        // &T
    MutableReference(Box<Type>), // &mut T
    Pointer(Box<Type>),          // *T

    // Collections
    Array(Box<Type>, usize, usize), // [T; Init; Length]
    Tuple(Vec<Type>),               // [T1, T2, T3]

    // Generics
    Generic(String, Vec<Type>), // Vec<I32>, Option<T>, etc.
    TypeParameter(String),      // T, U, etc. (for fn<T>)

    // Unions (for Result, Option)
    Union(Vec<Type>), // T | E | U

    // Function pointers
    FunctionPointer(Vec<Type>, Box<Type>), // |Args...| => ReturnType
}

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

    // Variable declaration: let x = 5; or let x : I32 = 5;
    Let {
        name: String,
        ty: Option<Type>,
        value: Option<Expr>,
    },

    // Function declaration: fn add(a : I32, b : I32) : I32 => a + b;
    Function {
        name: String,
        type_params: Vec<String>,    // Generic parameters: fn<T, U>
        params: Vec<(String, Type)>, // Parameter names with their types
        return_type: Type,           // Return type (default Void if not specified)
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
