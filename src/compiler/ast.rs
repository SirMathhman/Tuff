// AST Module (Stub)

use crate::compiler::Span;

#[derive(Debug, Clone)]
pub struct Program {
    pub items: Vec<Item>,
}

#[derive(Debug, Clone)]
pub enum Item {
    FunctionDef(FunctionDef),
    TypeDef(TypeDef),
    ExternBlock(ExternBlock),
}

#[derive(Debug, Clone)]
pub struct FunctionDef {
    pub name: String,
    pub parameters: Vec<Parameter>,
    pub return_type: Option<Type>,
    pub body: Block,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct Parameter {
    pub name: String,
    pub ty: Type,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct TypeDef {
    pub name: String,
    pub type_params: Vec<String>,
    pub variants: Vec<Variant>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct Variant {
    pub name: String,
    pub data: Option<Type>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct ExternBlock {
    pub decls: Vec<ExternDecl>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct ExternDecl {
    pub name: String,
    pub parameters: Vec<Parameter>,
    pub return_type: Option<Type>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct Block {
    pub statements: Vec<Statement>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub enum Statement {
    Let(LetStmt),
    Assign(AssignStmt),
    Expr(ExprStmt),
    If(IfStmt),
    Match(MatchStmt),
    Loop(LoopStmt),
    Return(ReturnStmt),
}

#[derive(Debug, Clone)]
pub struct LetStmt {
    pub name: String,
    pub ty: Option<Type>,
    pub value: Option<Box<Expr>>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct AssignStmt {
    pub target: Box<Expr>,
    pub value: Box<Expr>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct ExprStmt {
    pub expr: Box<Expr>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct IfStmt {
    pub condition: Box<Expr>,
    pub then_block: Block,
    pub else_block: Option<Block>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct MatchStmt {
    pub expr: Box<Expr>,
    pub arms: Vec<MatchArm>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct MatchArm {
    pub pattern: Pattern,
    pub body: Block,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct LoopStmt {
    pub body: Block,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct ReturnStmt {
    pub value: Option<Box<Expr>>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub enum Expr {
    Literal(Literal),
    Variable(Variable),
    BinaryOp(BinaryOp),
    UnaryOp(UnaryOp),
    FunctionCall(FunctionCall),
    FieldAccess(FieldAccess),
    Index(Index),
    Constructor(Constructor),
}

#[derive(Debug, Clone)]
pub enum Literal {
    Number(String),
    String(String),
    Bool(bool),
}

#[derive(Debug, Clone)]
pub struct Variable {
    pub name: String,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct BinaryOp {
    pub left: Box<Expr>,
    pub op: String,
    pub right: Box<Expr>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct UnaryOp {
    pub op: String,
    pub expr: Box<Expr>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct FunctionCall {
    pub func: Box<Expr>,
    pub args: Vec<Expr>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct FieldAccess {
    pub expr: Box<Expr>,
    pub field: String,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct Index {
    pub expr: Box<Expr>,
    pub index: Box<Expr>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct Constructor {
    pub name: String,
    pub args: Vec<Expr>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub enum Pattern {
    Identifier(String),
    Wildcard,
    Constructor(String, Vec<Pattern>),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Type {
    Primitive(String),
    Named(String),
    Reference(Box<Type>, bool), // bool = is_mutable
    Generic(String, Vec<Type>),
    Function(Vec<Type>, Box<Type>), // params, return
}

impl Type {
    pub fn i32() -> Self {
        Type::Primitive("i32".to_string())
    }

    pub fn i64() -> Self {
        Type::Primitive("i64".to_string())
    }

    pub fn f32() -> Self {
        Type::Primitive("f32".to_string())
    }

    pub fn f64() -> Self {
        Type::Primitive("f64".to_string())
    }

    pub fn bool() -> Self {
        Type::Primitive("bool".to_string())
    }

    pub fn void() -> Self {
        Type::Primitive("void".to_string())
    }
}
