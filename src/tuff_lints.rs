use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy)]
pub struct LintConfig {
    pub max_fn_nesting: usize,
    pub max_struct_fields: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ViolationKey {
    pub kind: String,
    pub path: String,
    pub item: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Violation {
    pub key: ViolationKey,
    pub value: usize,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BaselineEntry {
    pub key: ViolationKey,
    pub value: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Baseline {
    pub entries: Vec<BaselineEntry>,
}

impl Baseline {
    pub fn from_violations(violations: &[Violation]) -> Self {
        Self {
            entries: violations
                .iter()
                .map(|v| BaselineEntry {
                    key: v.key.clone(),
                    value: v.value,
                })
                .collect(),
        }
    }
}

pub fn analyze_source(
    source: &str,
    path: &str,
    config: LintConfig,
) -> Result<Vec<Violation>, String> {
    let file = syn::parse_file(source).map_err(|e| format!("Failed to parse {path}: {e}"))?;

    let mut analyzer = Analyzer::new(path, config);
    analyzer.analyze_file(&file);
    Ok(analyzer.violations)
}

struct Analyzer<'a> {
    path: &'a str,
    config: LintConfig,
    violations: Vec<Violation>,
}

impl<'a> Analyzer<'a> {
    fn new(path: &'a str, config: LintConfig) -> Self {
        Self {
            path,
            config,
            violations: Vec::new(),
        }
    }

    fn analyze_file(&mut self, file: &syn::File) {
        for item in &file.items {
            self.analyze_item(item);
        }
    }

    fn analyze_item(&mut self, item: &syn::Item) {
        match item {
            syn::Item::Struct(s) => self.check_struct(s),
            syn::Item::Fn(f) => self.check_fn(&f.sig.ident.to_string(), &f.block),
            syn::Item::Impl(imp) => self.check_impl(imp),
            _ => {}
        }
    }

    fn check_impl(&mut self, imp: &syn::ItemImpl) {
        let self_ty = type_to_string(&imp.self_ty);
        for impl_item in &imp.items {
            if let syn::ImplItem::Fn(m) = impl_item {
                let item_name = format!("{self_ty}::{}", m.sig.ident);
                self.check_fn(&item_name, &m.block);
            }
        }
    }

    fn check_struct(&mut self, s: &syn::ItemStruct) {
        let field_count = match &s.fields {
            syn::Fields::Named(f) => f.named.len(),
            syn::Fields::Unnamed(f) => f.unnamed.len(),
            syn::Fields::Unit => 0,
        };

        if field_count > self.config.max_struct_fields {
            self.violations.push(Violation {
                key: ViolationKey {
                    kind: "struct_fields".to_string(),
                    path: self.path.to_string(),
                    item: s.ident.to_string(),
                },
                value: field_count,
                message: format!(
                    "struct has {field_count} fields (max {})",
                    self.config.max_struct_fields
                ),
            });
        }
    }

    fn check_fn(&mut self, item_name: &str, block: &syn::Block) {
        // Depth definition: function body is depth 0; entering any nested block increases depth.
        let max_depth = max_nesting_in_block(block, 0);

        if max_depth > self.config.max_fn_nesting {
            self.violations.push(Violation {
                key: ViolationKey {
                    kind: "fn_nesting".to_string(),
                    path: self.path.to_string(),
                    item: item_name.to_string(),
                },
                value: max_depth,
                message: format!(
                    "function nesting depth is {max_depth} (max {})",
                    self.config.max_fn_nesting
                ),
            });
        }
    }
}

fn max_nesting_in_block(block: &syn::Block, depth: usize) -> usize {
    let mut max_depth = depth;

    for stmt in &block.stmts {
        max_depth = max_depth.max(max_nesting_in_stmt(stmt, depth));
    }

    max_depth
}

fn max_nesting_in_stmt(stmt: &syn::Stmt, depth: usize) -> usize {
    match stmt {
        syn::Stmt::Local(local) => {
            if let Some(init) = &local.init {
                max_nesting_in_expr(&init.expr, depth)
            } else {
                depth
            }
        }
        syn::Stmt::Item(_) => depth,
        syn::Stmt::Expr(expr, _) => max_nesting_in_expr(expr, depth),
        syn::Stmt::Macro(_) => depth,
    }
}

fn max_nesting_in_expr(expr: &syn::Expr, depth: usize) -> usize {
    use syn::Expr;

    match expr {
        Expr::Block(b) => max_nesting_in_block(&b.block, depth + 1),
        Expr::If(e) => max_nesting_in_if(e, depth),
        Expr::While(e) => max_nesting_in_while(e, depth),
        Expr::ForLoop(e) => max_nesting_in_for_loop(e, depth),
        Expr::Loop(e) => max_nesting_in_block(&e.body, depth + 1),
        Expr::Match(e) => max_nesting_in_match(e, depth),
        Expr::Closure(e) => max_nesting_in_expr(&e.body, depth),
        Expr::Paren(e) => max_nesting_in_expr(&e.expr, depth),
        Expr::Return(e) => max_nesting_in_opt_expr(e.expr.as_deref(), depth),
        Expr::Break(e) => max_nesting_in_opt_expr(e.expr.as_deref(), depth),
        Expr::Continue(_) => depth,
        Expr::Call(e) => max_nesting_in_call(&e.func, &e.args, depth),
        Expr::MethodCall(e) => max_nesting_in_call(&e.receiver, &e.args, depth),
        Expr::Binary(e) => max_nesting_in_pair(&e.left, &e.right, depth),
        Expr::Unary(e) => max_nesting_in_expr(&e.expr, depth),
        Expr::Assign(e) => max_nesting_in_pair(&e.left, &e.right, depth),
        Expr::Index(e) => max_nesting_in_pair(&e.expr, &e.index, depth),
        Expr::Field(e) => max_nesting_in_expr(&e.base, depth),
        Expr::Reference(e) => max_nesting_in_expr(&e.expr, depth),
        Expr::Lit(_) | Expr::Path(_) => depth,
        Expr::Tuple(e) => max_nesting_in_exprs(e.elems.iter(), depth),
        Expr::Array(e) => max_nesting_in_exprs(e.elems.iter(), depth),
        Expr::Struct(e) => max_nesting_in_struct_expr(e, depth),
        // Conservative fallback: walk any nested expressions we know about later.
        _ => depth,
    }
}

fn max_nesting_in_if(e: &syn::ExprIf, depth: usize) -> usize {
    let mut max_depth = max_nesting_in_expr(&e.cond, depth);
    max_depth = max_depth.max(max_nesting_in_block(&e.then_branch, depth + 1));
    if let Some((_, else_expr)) = &e.else_branch {
        max_depth = max_depth.max(max_nesting_in_expr(else_expr, depth + 1));
    }
    max_depth
}

fn max_nesting_in_while(e: &syn::ExprWhile, depth: usize) -> usize {
    max_nesting_in_expr(&e.cond, depth).max(max_nesting_in_block(&e.body, depth + 1))
}

fn max_nesting_in_for_loop(e: &syn::ExprForLoop, depth: usize) -> usize {
    max_nesting_in_expr(&e.expr, depth).max(max_nesting_in_block(&e.body, depth + 1))
}

fn max_nesting_in_match(e: &syn::ExprMatch, depth: usize) -> usize {
    let mut max_depth = max_nesting_in_expr(&e.expr, depth);

    for arm in &e.arms {
        max_depth = max_depth.max(max_nesting_in_expr(&arm.body, depth + 1));
        if let Some((_, guard_expr)) = &arm.guard {
            max_depth = max_depth.max(max_nesting_in_expr(guard_expr, depth + 1));
        }
    }

    max_depth
}

fn max_nesting_in_opt_expr(expr: Option<&syn::Expr>, depth: usize) -> usize {
    match expr {
        Some(e) => max_nesting_in_expr(e, depth),
        None => depth,
    }
}

fn max_nesting_in_call(
    func: &syn::Expr,
    args: &syn::punctuated::Punctuated<syn::Expr, syn::Token![,]>,
    depth: usize,
) -> usize {
    let mut max_depth = max_nesting_in_expr(func, depth);
    for arg in args {
        max_depth = max_depth.max(max_nesting_in_expr(arg, depth));
    }
    max_depth
}

fn max_nesting_in_pair(left: &syn::Expr, right: &syn::Expr, depth: usize) -> usize {
    max_nesting_in_expr(left, depth).max(max_nesting_in_expr(right, depth))
}

fn max_nesting_in_exprs<'a>(exprs: impl Iterator<Item = &'a syn::Expr>, depth: usize) -> usize {
    exprs
        .map(|x| max_nesting_in_expr(x, depth))
        .max()
        .unwrap_or(depth)
}

fn max_nesting_in_struct_expr(e: &syn::ExprStruct, depth: usize) -> usize {
    let mut max_depth = e
        .fields
        .iter()
        .map(|f| max_nesting_in_expr(&f.expr, depth))
        .max()
        .unwrap_or(depth);

    if let Some(rest) = &e.rest {
        max_depth = max_depth.max(max_nesting_in_expr(rest, depth));
    }

    max_depth
}

fn type_to_string(ty: &syn::Type) -> String {
    match ty {
        syn::Type::Path(p) => p
            .path
            .segments
            .iter()
            .map(|s| s.ident.to_string())
            .collect::<Vec<_>>()
            .join("::"),
        _ => "<type>".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> LintConfig {
        LintConfig {
            max_fn_nesting: 2,
            max_struct_fields: 5,
        }
    }

    #[test]
    fn struct_with_6_fields_is_flagged() {
        let src = r#"
            struct S { a:i32, b:i32, c:i32, d:i32, e:i32, f:i32 }
        "#;
        let v = match analyze_source(src, "test.rs", cfg()) {
            Ok(v) => v,
            Err(e) => {
                assert!(e.is_empty(), "{e}");
                return;
            }
        };
        assert!(v
            .iter()
            .any(|x| x.key.kind == "struct_fields" && x.key.item == "S" && x.value == 6));
    }

    #[test]
    fn function_nesting_at_limit_passes() {
        let src = r#"
            fn f() {
                if true {
                    if true {
                        let _x = 1;
                    }
                }
            }
        "#;
        let v = match analyze_source(src, "test.rs", cfg()) {
            Ok(v) => v,
            Err(e) => {
                assert!(e.is_empty(), "{e}");
                return;
            }
        };
        assert!(!v.iter().any(|x| x.key.kind == "fn_nesting"));
    }

    #[test]
    fn function_nesting_over_limit_is_flagged() {
        let src = r#"
            fn f() {
                if true {
                    if true {
                        if true {
                            let _x = 1;
                        }
                    }
                }
            }
        "#;
        let v = match analyze_source(src, "test.rs", cfg()) {
            Ok(v) => v,
            Err(e) => {
                assert!(e.is_empty(), "{e}");
                return;
            }
        };

        let viol = match v
            .iter()
            .find(|x| x.key.kind == "fn_nesting" && x.key.item == "f")
        {
            Some(v) => v,
            None => {
                assert!(
                    v.iter().any(|x| x.key.kind == "fn_nesting"),
                    "expected fn_nesting violation"
                );
                return;
            }
        };
        assert_eq!(viol.value, 3);
    }
}
