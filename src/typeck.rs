use std::collections::HashMap;

use crate::Span;
use crate::ast::{BinOp, Expr, Stmt};

/// Statement analysis: `let`, assignment, `break`, and target checks.
mod stmt;

/// A static type, as determined by the analysis pass.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Type {
    /// An integer.
    Int,
    /// A boolean.
    Bool,
    /// A shared reference.
    Ref,
    /// A mutable reference.
    MutRef,
    /// An array of a known element type.
    Array(Box<Type>),
}

impl Type {
    /// Whether `other` may be assigned to a binding of this type.
    pub fn compatible(&self, other: &Type) -> bool {
        match (self, other) {
            (Type::Array(a), Type::Array(b)) => a.compatible(b),
            _ => self == other,
        }
    }

    /// The name of this type, for error messages.
    pub fn name(&self) -> &'static str {
        match self {
            Type::Int => "integer",
            Type::Bool => "boolean",
            Type::Ref => "shared reference",
            Type::MutRef => "mutable reference",
            Type::Array(_) => "array",
        }
    }
}

/// A unique identifier for a variable binding, assigned at `let` time.
/// References and dereferences carry the target's ID, so they are robust to
/// shadowing and scope exit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct VarId(usize);

impl VarId {
    /// A new variable ID with the given index.
    pub fn new(index: usize) -> Self {
        VarId(index)
    }
}

/// The type environment: a stack of scopes mapping variable IDs to
/// (name, type, mutable). Used by the analysis pass to check types without
/// executing.
#[derive(Debug, Default)]
pub struct TypeEnv {
    /// The scope stack, innermost scope last.
    scopes: Vec<HashMap<VarId, (String, Type, bool)>>,
    /// The next variable ID to assign.
    next_id: usize,
    /// Variable IDs mapped to their source names, for diagnostics.
    names: HashMap<VarId, String>,
    /// Reference variable IDs mapped to the variable they point at.
    targets: HashMap<VarId, VarId>,
    /// One collector per enclosing `loop`, innermost last. Each holds the
    /// (type, span) of the `break`s in that loop's body, used to infer the
    /// loop's type and check break consistency.
    break_collectors: Vec<Vec<(Type, Span)>>,
}

impl TypeEnv {
    /// Push a new empty scope.
    fn push_scope(&mut self) {
        self.scopes.push(HashMap::new());
    }

    /// Pop the innermost scope.
    fn pop_scope(&mut self) {
        self.scopes.pop();
    }

    /// Look up a binding by variable ID, walking the scope chain from
    /// innermost out.
    fn get(&self, id: VarId) -> Option<(String, Type, bool)> {
        self.scopes
            .iter()
            .rev()
            .find_map(|scope| scope.get(&id).map(|(n, t, m)| (n.clone(), t.clone(), *m)))
    }

    /// Bind a new variable in the innermost scope, assigning it a fresh ID.
    fn insert(&mut self, name: String, ty: Type, mutable: bool) -> VarId {
        let id = VarId::new(self.next_id);
        self.next_id += 1;
        self.names.insert(id, name.clone());
        self.scopes
            .last_mut()
            .expect("a scope is always present")
            .insert(id, (name, ty, mutable));
        id
    }

    /// The source name of a variable, for diagnostics.
    fn name(&self, id: VarId) -> String {
        self.names.get(&id).cloned().unwrap_or_default()
    }

    /// The variable name table, for seeding the evaluator's environment.
    pub fn names(&self) -> &HashMap<VarId, String> {
        &self.names
    }

    /// Resolve a source name to its variable ID and binding, walking the
    /// scope chain from innermost out.
    fn resolve(&self, name: &str, _span: Span) -> Option<(VarId, Type, bool)> {
        for scope in self.scopes.iter().rev() {
            for (id, (bound, ty, mutable)) in scope {
                if bound == name {
                    return Some((*id, ty.clone(), *mutable));
                }
            }
        }
        None
    }

    /// Assign a type to an existing mutable binding, walking the scope chain.
    fn set(&mut self, id: VarId, ty: Type, span: Span) -> Result<(), crate::TuffError> {
        let name = self.name(id);
        for scope in self.scopes.iter_mut().rev() {
            if let Some((_, current, mutable)) = scope.get_mut(&id) {
                if !*mutable {
                    return Err(crate::TuffError::ImmutableAssignment { span, name });
                }
                if !current.compatible(&ty) {
                    return Err(crate::TuffError::TypeMismatch {
                        span,
                        found: ty.name(),
                        expected: current.name(),
                        name,
                    });
                }
                *current = ty;
                return Ok(());
            }
        }
        Err(crate::TuffError::UndefinedVariable { span, name })
    }
}

/// A type-annotated expression. Produced by the analysis pass and consumed by
/// the evaluator, which no longer needs to re-check static properties.
#[derive(Debug)]
pub enum TypedExpr {
    /// An integer literal.
    Num(i64, Span),
    /// A boolean literal.
    Bool(bool, Span),
    /// A binary operation with a known result type.
    Bin(BinOp, Box<TypedExpr>, Box<TypedExpr>, Type, Span),
    /// A parenthesized expression.
    Group(Box<TypedExpr>, Span),
    /// An array literal.
    Array(Vec<TypedExpr>, Span),
    /// An array index; the base is known to be an array and the index an int.
    Index(Box<TypedExpr>, Box<TypedExpr>, Span),
    /// A variable reference with a known type.
    Ident(VarId, Type, Span),
    /// A reference to a variable.
    Ref(VarId, bool, Span),
    /// A dereference of a reference variable, with the resolved target type.
    Deref(VarId, Type, Span),
    /// A conditional; both branches share a known type.
    If(Box<TypedExpr>, Box<TypedExpr>, Box<TypedExpr>, Type, Span),
    /// A `loop` expression; its value type is carried by its `break`s.
    Loop(Vec<TypedStmt>, Type, Span),
    /// A block of statements with a known value type.
    Block(Vec<TypedStmt>, Type, Span),
}

/// A type-annotated statement.
#[derive(Debug)]
pub enum TypedStmt {
    /// A `let` binding with a known type.
    Let(VarId, bool, Box<TypedExpr>, Type, Span),
    /// An assignment to a known-valid target.
    Assign(Box<TypedExpr>, Box<TypedExpr>, Span),
    /// A `break` carrying a value of the enclosing loop's type.
    Break(Box<TypedExpr>, Span),
    /// An expression statement.
    Expr(Box<TypedExpr>),
}

/// Analyze an expression AST, checking types without executing. Returns a
/// type-annotated tree the evaluator consumes; both `if` branches are analyzed.
pub fn analyze(expr: &Expr, env: &mut TypeEnv) -> Result<TypedExpr, crate::TuffError> {
    match expr {
        Expr::Num(value, span) => Ok(TypedExpr::Num(*value, *span)),
        Expr::Bool(value, span) => Ok(TypedExpr::Bool(*value, *span)),
        Expr::Bin(op, left, right, span) => analyze_bin(*op, left, right, env, *span),
        Expr::Group(inner, span, _) => Ok(TypedExpr::Group(Box::new(analyze(inner, env)?), *span)),
        Expr::Array(elements, span) => analyze_array(elements, env, *span),
        Expr::Index(base, index, span) => analyze_index(base, index, env, *span),
        Expr::Ident(name, span) => match env.resolve(name, *span) {
            Some((id, ty, _)) => Ok(TypedExpr::Ident(id, ty, *span)),
            None => Err(crate::TuffError::UndefinedVariable {
                span: *span,
                name: name.clone(),
            }),
        },
        Expr::Ref(inner, mutable, span) => analyze_ref(inner, *mutable, env, *span),
        Expr::Deref(inner, span) => analyze_deref(inner, env, *span),
        Expr::If(cond, then, otherwise, span) => analyze_if(cond, then, otherwise, env, *span),
        Expr::Loop(body, span) => analyze_loop(body, env, *span),
        Expr::Block(stmts, span, _) => analyze_block(stmts, env, *span),
    }
}

/// Analyze a binary operation, checking operand types against the operator.
fn analyze_bin(
    op: BinOp,
    left: &Expr,
    right: &Expr,
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedExpr, crate::TuffError> {
    // A literal zero divisor is a compile-time error; a runtime zero
    // (e.g. through a variable) is still caught dynamically by eval.
    if op == BinOp::Div
        && let Expr::Num(0, _) = right
    {
        return Err(crate::TuffError::DivisionByZero { span });
    }
    let l = analyze(left, env)?;
    let r = analyze(right, env)?;
    let ty = match op {
        BinOp::Eq | BinOp::Ne => Type::Bool,
        _ => {
            if l.ty() != Type::Int || r.ty() != Type::Int {
                return Err(crate::TuffError::ExpectedInteger { span });
            }
            match op {
                BinOp::Lt | BinOp::LtEq | BinOp::Gt | BinOp::GtEq => Type::Bool,
                _ => Type::Int,
            }
        }
    };
    Ok(TypedExpr::Bin(op, Box::new(l), Box::new(r), ty, span))
}

/// Analyze an index expression, checking the base is an array and the index
/// an integer.
fn analyze_index(
    base: &Expr,
    index: &Expr,
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedExpr, crate::TuffError> {
    let b = analyze(base, env)?;
    let i = analyze(index, env)?;
    if i.ty() != Type::Int {
        return Err(crate::TuffError::ExpectedIntegerIndex { span });
    }
    let Type::Array(_) = b.ty() else {
        return Err(crate::TuffError::NotAnArray { span });
    };
    Ok(TypedExpr::Index(Box::new(b), Box::new(i), span))
}

/// Analyze an array literal, inferring the element type from the first
/// element and checking the rest against it.
fn analyze_array(
    elements: &[Expr],
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedExpr, crate::TuffError> {
    let mut items = Vec::with_capacity(elements.len());
    let mut element_ty = None;
    for element in elements {
        let item = analyze(element, env)?;
        let ty = item.ty();
        match &element_ty {
            None => element_ty = Some(ty),
            Some(expected) => {
                if !expected.compatible(&ty) {
                    return Err(crate::TuffError::ElementTypeMismatch {
                        span: element.span(),
                        found: ty.name(),
                        expected: expected.name(),
                    });
                }
            }
        }
        items.push(item);
    }
    Ok(TypedExpr::Array(items, span))
}

/// Analyze a reference expression, checking the inner is a defined variable.
fn analyze_ref(
    inner: &Expr,
    mutable: bool,
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedExpr, crate::TuffError> {
    let Expr::Ident(name, _) = inner else {
        return Err(crate::TuffError::ExpectedVariableName { span, after: "&" });
    };
    match env.resolve(name, span) {
        Some((id, _, _)) => Ok(TypedExpr::Ref(id, mutable, span)),
        None => Err(crate::TuffError::UndefinedVariable {
            span,
            name: name.clone(),
        }),
    }
}

/// Analyze a dereference expression, resolving the referenced variable's type.
fn analyze_deref(
    inner: &Expr,
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedExpr, crate::TuffError> {
    let Expr::Ident(name, _) = inner else {
        return Err(crate::TuffError::ExpectedVariableName { span, after: "*" });
    };
    match env.resolve(name, span) {
        Some((id, Type::Ref, _)) | Some((id, Type::MutRef, _)) => {
            let target = env.targets.get(&id).copied().ok_or_else(|| {
                crate::TuffError::UndefinedVariable {
                    span,
                    name: env.name(id),
                }
            })?;
            match env.get(target) {
                Some((_, ty, _)) => Ok(TypedExpr::Deref(target, ty, span)),
                None => Err(crate::TuffError::UndefinedVariable {
                    span,
                    name: env.name(target),
                }),
            }
        }
        Some((_, _, _)) => Err(crate::TuffError::NotAReference {
            span,
            name: name.clone(),
        }),
        None => Err(crate::TuffError::UndefinedVariable {
            span,
            name: name.clone(),
        }),
    }
}

/// Analyze a conditional, checking the condition is boolean and both branches
/// share a type. Both branches are analyzed; the taken branch is evaluated later.
fn analyze_if(
    cond: &Expr,
    then: &Expr,
    otherwise: &Expr,
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedExpr, crate::TuffError> {
    let c = analyze(cond, env)?;
    if c.ty() != Type::Bool {
        return Err(crate::TuffError::ExpectedBooleanCondition { span });
    }
    let then_t = analyze(then, env)?;
    let otherwise_t = analyze(otherwise, env)?;
    let then_ty = then_t.ty();
    let otherwise_ty = otherwise_t.ty();
    if then_ty != otherwise_ty {
        return Err(crate::TuffError::TypeMismatch {
            span,
            found: otherwise_ty.name(),
            expected: then_ty.name(),
            name: "if".into(),
        });
    }
    Ok(TypedExpr::If(
        Box::new(c),
        Box::new(then_t),
        Box::new(otherwise_t),
        then_ty,
        span,
    ))
}

/// Analyze a block in a fresh scope, returning its value type.
fn analyze_block(
    stmts: &[Stmt],
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedExpr, crate::TuffError> {
    env.push_scope();
    let mut typed = Vec::with_capacity(stmts.len());
    for stmt in stmts {
        typed.push(stmt::analyze_stmt(stmt, env)?);
    }
    env.pop_scope();
    let ty = typed
        .last()
        .and_then(|s| s.ty())
        .ok_or(crate::TuffError::BlockHasNoValue { span })?;
    Ok(TypedExpr::Block(typed, ty, span))
}

/// The static type of a typed expression.
impl TypedExpr {
    /// The static type of this expression.
    fn ty(&self) -> Type {
        match self {
            TypedExpr::Num(_, _) => Type::Int,
            TypedExpr::Bool(_, _) => Type::Bool,
            TypedExpr::Bin(_, _, _, ty, _) => ty.clone(),
            TypedExpr::Group(inner, _) => inner.ty(),
            TypedExpr::Array(items, _) => {
                let element = items.first().map(|i| i.ty()).unwrap_or(Type::Int);
                Type::Array(Box::new(element))
            }
            TypedExpr::Index(base, _, _) => {
                let Type::Array(element) = base.ty() else {
                    return Type::Int;
                };
                *element
            }
            TypedExpr::Ident(_, ty, _) => ty.clone(),
            TypedExpr::Ref(_, mutable, _) => {
                if *mutable {
                    Type::MutRef
                } else {
                    Type::Ref
                }
            }
            TypedExpr::Deref(_, ty, _) => ty.clone(),
            TypedExpr::If(_, _, _, ty, _) => ty.clone(),
            TypedExpr::Loop(_, ty, _) => ty.clone(),
            TypedExpr::Block(_, ty, _) => ty.clone(),
        }
    }
}

/// The static type of a typed statement, if it produces a value.
impl TypedStmt {
    /// The static type of this statement, if it produces a value.
    fn ty(&self) -> Option<Type> {
        match self {
            TypedStmt::Let(_, _, _, ty, _) => Some(ty.clone()),
            // An assignment statement evaluates to the unit integer `0`.
            TypedStmt::Assign(_, _, _) => Some(Type::Int),
            // A `break` carries the loop's value, not the block's.
            TypedStmt::Break(_, _) => None,
            TypedStmt::Expr(e) => Some(e.ty()),
        }
    }
}

/// Analyze a `loop` expression: the body runs in a fresh scope and the loop's
/// type is inferred from its `break`s.
fn analyze_loop(
    body: &[Stmt],
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedExpr, crate::TuffError> {
    env.break_collectors.push(Vec::new());
    env.push_scope();
    let mut typed = Vec::with_capacity(body.len());
    for stmt in body {
        typed.push(stmt::analyze_stmt(stmt, env)?);
    }
    env.pop_scope();
    let breaks = env
        .break_collectors
        .pop()
        .expect("a break collector was pushed");
    if breaks.is_empty() {
        return Err(crate::TuffError::LoopHasNoBreak { span });
    }
    let (ty, _) = &breaks[0];
    for (break_ty, break_span) in &breaks[1..] {
        if !ty.compatible(break_ty) {
            return Err(crate::TuffError::BreakTypeMismatch {
                span: *break_span,
                found: break_ty.name(),
                expected: ty.name(),
            });
        }
    }
    Ok(TypedExpr::Loop(typed, ty.clone(), span))
}
