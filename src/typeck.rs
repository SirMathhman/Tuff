use std::collections::HashMap;

use crate::Span;
use crate::ast::{BinOp, Expr, Stmt};

/// A static type, as determined by the analysis pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Type {
    /// An integer.
    Int,
    /// A boolean.
    Bool,
    /// A shared reference.
    Ref,
    /// A mutable reference.
    MutRef,
    /// An array.
    Array,
}

impl Type {
    /// Whether `other` may be assigned to a binding of this type.
    pub fn compatible(self, other: Type) -> bool {
        self == other
    }

    /// The name of this type, for error messages.
    pub fn name(self) -> &'static str {
        match self {
            Type::Int => "integer",
            Type::Bool => "boolean",
            Type::Ref => "shared reference",
            Type::MutRef => "mutable reference",
            Type::Array => "array",
        }
    }
}

/// The type environment: a stack of scopes mapping names to (type, mutable).
/// Used by the analysis pass to check types without executing.
#[derive(Debug, Default)]
pub struct TypeEnv {
    /// The scope stack, innermost scope last.
    scopes: Vec<HashMap<String, (Type, bool)>>,
    /// Reference variable names mapped to the variable they point at.
    targets: HashMap<String, String>,
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

    /// Look up a binding by name, walking the scope chain from innermost out.
    fn get(&self, name: &str) -> Option<(Type, bool)> {
        self.scopes
            .iter()
            .rev()
            .find_map(|scope| scope.get(name).copied())
    }

    /// Bind a name in the innermost scope.
    fn insert(&mut self, name: String, ty: Type, mutable: bool) {
        self.scopes
            .last_mut()
            .expect("a scope is always present")
            .insert(name, (ty, mutable));
    }

    /// Assign a type to an existing mutable binding, walking the scope chain.
    fn set(&mut self, name: &str, ty: Type, span: Span) -> Result<(), crate::TuffError> {
        for scope in self.scopes.iter_mut().rev() {
            if let Some((current, mutable)) = scope.get_mut(name) {
                if !*mutable {
                    return Err(crate::TuffError::ImmutableAssignment {
                        span,
                        name: name.to_string(),
                    });
                }
                if !current.compatible(ty) {
                    return Err(crate::TuffError::TypeMismatch {
                        span,
                        found: ty.name(),
                        expected: current.name(),
                        name: name.to_string(),
                    });
                }
                *current = ty;
                return Ok(());
            }
        }
        Err(crate::TuffError::UndefinedVariable {
            span,
            name: name.to_string(),
        })
    }
}

/// Analyze an expression AST, checking types without executing. Returns the
/// static type of the expression. Both branches of an `if` are analyzed; only
/// the taken branch is later evaluated.
pub fn analyze(expr: &Expr, env: &mut TypeEnv) -> Result<Type, crate::TuffError> {
    match expr {
        Expr::Num(_, _) => Ok(Type::Int),
        Expr::Bool(_, _) => Ok(Type::Bool),
        Expr::Bin(op, left, right, span) => {
            let l = analyze(left, env)?;
            let r = analyze(right, env)?;
            match op {
                BinOp::Eq | BinOp::Ne => Ok(Type::Bool),
                _ => {
                    if l != Type::Int || r != Type::Int {
                        return Err(crate::TuffError::ExpectedInteger { span: *span });
                    }
                    match op {
                        BinOp::Lt | BinOp::LtEq | BinOp::Gt | BinOp::GtEq => Ok(Type::Bool),
                        _ => Ok(Type::Int),
                    }
                }
            }
        }
        Expr::Group(inner, _, _) => analyze(inner, env),
        Expr::Array(elements, _) => {
            for element in elements {
                analyze(element, env)?;
            }
            Ok(Type::Array)
        }
        Expr::Index(base, index, span) => {
            let b = analyze(base, env)?;
            let i = analyze(index, env)?;
            if i != Type::Int {
                return Err(crate::TuffError::ExpectedIntegerIndex { span: *span });
            }
            if b != Type::Array {
                return Err(crate::TuffError::NotAnArray { span: *span });
            }
            Ok(Type::Int)
        }
        Expr::Ident(name, span) => match env.get(name) {
            Some((ty, _)) => Ok(ty),
            None => Err(crate::TuffError::UndefinedVariable {
                span: *span,
                name: name.clone(),
            }),
        },
        Expr::Ref(inner, mutable, span) => {
            let Expr::Ident(name, _) = inner.as_ref() else {
                return Err(crate::TuffError::ExpectedVariableName {
                    span: *span,
                    after: "&",
                });
            };
            match env.get(name) {
                Some((_, _)) => Ok(if *mutable { Type::MutRef } else { Type::Ref }),
                None => Err(crate::TuffError::UndefinedVariable {
                    span: *span,
                    name: name.clone(),
                }),
            }
        }
        Expr::Deref(inner, span) => {
            let Expr::Ident(name, _) = inner.as_ref() else {
                return Err(crate::TuffError::ExpectedVariableName {
                    span: *span,
                    after: "*",
                });
            };
            match env.get(name) {
                Some((Type::Ref, _)) | Some((Type::MutRef, _)) => {
                    let target = env.targets.get(name).cloned().unwrap_or_default();
                    match env.get(&target) {
                        Some((ty, _)) => Ok(ty),
                        None => Err(crate::TuffError::UndefinedVariable {
                            span: *span,
                            name: target,
                        }),
                    }
                }
                Some((_, _)) => Err(crate::TuffError::NotAReference {
                    span: *span,
                    name: name.clone(),
                }),
                None => Err(crate::TuffError::UndefinedVariable {
                    span: *span,
                    name: name.clone(),
                }),
            }
        }
        Expr::If(cond, then, otherwise, span) => {
            let c = analyze(cond, env)?;
            if c != Type::Bool {
                return Err(crate::TuffError::ExpectedBooleanCondition { span: *span });
            }
            // Both branches are analyzed; the taken branch is evaluated later.
            let then_ty = analyze(then, env)?;
            let otherwise_ty = analyze(otherwise, env)?;
            if then_ty != otherwise_ty {
                return Err(crate::TuffError::TypeMismatch {
                    span: *span,
                    found: otherwise_ty.name(),
                    expected: then_ty.name(),
                    name: "if".into(),
                });
            }
            Ok(then_ty)
        }
        Expr::Block(stmts, span, _) => {
            env.push_scope();
            let mut last = None;
            for stmt in stmts {
                last = Some(analyze_stmt(stmt, env)?);
            }
            env.pop_scope();
            last.ok_or(crate::TuffError::BlockHasNoValue { span: *span })
        }
    }
}

/// Analyze a statement, returning the type of its trailing expression (if any).
fn analyze_stmt(stmt: &Stmt, env: &mut TypeEnv) -> Result<Type, crate::TuffError> {
    match stmt {
        Stmt::Let(name, mutable, value, _) => {
            let ty = analyze(value, env)?;
            if let Expr::Ref(inner, _, _) = value.as_ref()
                && let Expr::Ident(target, _) = inner.as_ref()
            {
                env.targets.insert(name.clone(), target.clone());
            }
            env.insert(name.clone(), ty, *mutable);
            Ok(ty)
        }
        Stmt::Assign(target, value, span) => {
            let ty = analyze(value, env)?;
            match target.as_ref() {
                Expr::Ident(name, _) => {
                    env.set(name, ty, *span)?;
                    Ok(Type::Int)
                }
                Expr::Deref(inner, _) => {
                    let Expr::Ident(name, _) = inner.as_ref() else {
                        return Err(crate::TuffError::ExpectedVariableName {
                            span: *span,
                            after: "*",
                        });
                    };
                    match env.get(name) {
                        Some((Type::Ref, _)) => Err(crate::TuffError::CannotAssignThroughSharedReference {
                            span: *span,
                        }),
                        Some((Type::MutRef, _)) => {
                            let target = env.targets.get(name).cloned().unwrap_or_default();
                            match env.get(&target) {
                                Some((ty, _)) => Ok(ty),
                                None => Err(crate::TuffError::UndefinedVariable {
                                    span: *span,
                                    name: target,
                                }),
                            }
                        }
                        Some((_, _)) => Err(crate::TuffError::NotAReference {
                            span: *span,
                            name: name.clone(),
                        }),
                        None => Err(crate::TuffError::UndefinedVariable {
                            span: *span,
                            name: name.clone(),
                        }),
                    }
                }
                Expr::Index(base, index, _) => {
                    let Expr::Ident(name, _) = base.as_ref() else {
                        return Err(crate::TuffError::InvalidAssignmentTarget { span: *span });
                    };
                    let i = analyze(index, env)?;
                    if i != Type::Int {
                        return Err(crate::TuffError::ExpectedIntegerIndex { span: *span });
                    }
                    match env.get(name) {
                        Some((Type::Array, true)) => Ok(Type::Int),
                        Some((Type::Array, false)) => Err(crate::TuffError::ImmutableAssignment {
                            span: *span,
                            name: name.clone(),
                        }),
                        Some((_, _)) => Err(crate::TuffError::NotAnArray { span: *span }),
                        None => Err(crate::TuffError::UndefinedVariable {
                            span: *span,
                            name: name.clone(),
                        }),
                    }
                }
                _ => Err(crate::TuffError::InvalidAssignmentTarget { span: *span }),
            }
        }
        Stmt::Expr(e) => analyze(e, env),
    }
}
