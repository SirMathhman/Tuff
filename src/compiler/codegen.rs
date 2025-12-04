/// C code generator for Tuff compiler.
/// Translates type-checked and borrow-checked Tuff AST to C code.
///
/// Strategy:
/// - Primitives: Map directly to C types (i32 -> int32_t, etc.)
/// - References: Map to C pointers
/// - Discriminated unions: Use struct with discriminant + union
/// - Functions: Generate C functions with proper signatures

use crate::compiler::ast::*;
use crate::compiler::error::Span;

/// Code generator for producing C code
pub struct CodeGenerator {
    /// Accumulated C code
    code: String,
    /// Indentation level
    indent_level: usize,
}

impl CodeGenerator {
    pub fn new() -> Self {
        CodeGenerator {
            code: String::new(),
            indent_level: 0,
        }
    }

    /// Get the generated code
    pub fn code(&self) -> &str {
        &self.code
    }

    /// Emit generated C code and return it
    pub fn finish(self) -> String {
        self.code
    }

    /// Generate code for a program
    pub fn generate_program(&mut self, program: &Program) {
        self.emit_includes();
        self.emit_newline();
        self.emit_typedefs(program);
        self.emit_newline();

        for item in &program.items {
            self.generate_item(item);
            self.emit_newline();
        }
    }

    fn emit_includes(&mut self) {
        self.emit("#include <stdint.h>");
        self.emit("#include <stdbool.h>");
        self.emit("#include <stdio.h>");
    }

    fn emit_typedefs(&mut self, program: &Program) {
        for item in &program.items {
            if let Item::TypeDef(ty_def) = item {
                self.generate_typedef(ty_def);
            }
        }
    }

    fn generate_item(&mut self, item: &Item) {
        match item {
            Item::FunctionDef(func) => self.generate_function(func),
            Item::TypeDef(_) => {} // Already handled
            Item::ExternBlock(extern_block) => self.generate_extern_block(extern_block),
        }
    }

    fn generate_typedef(&mut self, ty_def: &TypeDef) {
        let name = &ty_def.name;

        // For union types, generate a discriminated union
        if ty_def.variants.len() > 1 {
            self.emit(&format!("typedef struct {}", name));
            self.emit(" {");
            self.indent();
            self.emit("int32_t tag;");
            self.emit("union {");
            self.indent();

            for variant in &ty_def.variants {
                if let Some(data) = &variant.data {
                    let c_type = self.type_to_c(data);
                    self.emit(&format!("{} {};", c_type, variant.name));
                } else {
                    self.emit("int32_t _;"); // Unit variant
                }
            }

            self.dedent();
            self.emit("} data;");
            self.dedent();
            self.emit(&format!("}} {};", name));
        }
    }

    fn generate_extern_block(&mut self, extern_block: &ExternBlock) {
        self.emit("// Extern declarations");
        for decl in &extern_block.decls {
            let return_type = decl
                .return_type
                .as_ref()
                .map(|t| self.type_to_c(t))
                .unwrap_or_else(|| "void".to_string());

            let mut params = String::new();
            for (i, param) in decl.parameters.iter().enumerate() {
                if i > 0 {
                    params.push_str(", ");
                }
                params.push_str(&self.type_to_c(&param.ty));
                params.push(' ');
                params.push_str(&param.name);
            }

            self.emit(&format!(
                "extern {} {}({});",
                return_type, decl.name, params
            ));
        }
    }

    fn generate_function(&mut self, func: &FunctionDef) {
        let return_type = func
            .return_type
            .as_ref()
            .map(|t| self.type_to_c(t))
            .unwrap_or_else(|| "void".to_string());

        let mut params = String::new();
        for (i, param) in func.parameters.iter().enumerate() {
            if i > 0 {
                params.push_str(", ");
            }
            params.push_str(&self.type_to_c(&param.ty));
            params.push(' ');
            params.push_str(&param.name);
        }

        self.emit(&format!(
            "{} {}({})",
            return_type, func.name, params
        ));
        self.emit(" {");
        self.indent();
        self.generate_block(&func.body);
        self.dedent();
        self.emit("}");
    }

    fn generate_block(&mut self, block: &Block) {
        for stmt in &block.statements {
            self.generate_statement(stmt);
        }
    }

    fn generate_statement(&mut self, stmt: &Statement) {
        match stmt {
            Statement::Let(let_stmt) => {
                let ty = let_stmt
                    .ty
                    .as_ref()
                    .map(|t| self.type_to_c(t))
                    .unwrap_or_else(|| "int32_t".to_string());

                if let Some(value) = &let_stmt.value {
                    self.emit(&format!("{} {} = ", ty, let_stmt.name));
                    self.generate_expr_inline(value);
                    self.emit(";");
                } else {
                    self.emit(&format!("{} {};", ty, let_stmt.name));
                }
            }
            Statement::Expr(expr_stmt) => {
                self.generate_expr_inline(&expr_stmt.expr);
                self.emit(";");
            }
            Statement::Assign(assign_stmt) => {
                self.generate_expr_inline(&assign_stmt.target);
                self.emit(" = ");
                self.generate_expr_inline(&assign_stmt.value);
                self.emit(";");
            }
            Statement::Return(ret_stmt) => {
                self.emit("return");
                if let Some(expr) = &ret_stmt.value {
                    self.emit(" ");
                    self.generate_expr_inline(expr);
                }
                self.emit(";");
            }
            Statement::If(if_stmt) => {
                self.emit("if (");
                self.generate_expr_inline(&if_stmt.condition);
                self.emit(") {");
                self.indent();
                self.generate_block(&if_stmt.then_block);
                self.dedent();
                self.emit("}");
                if let Some(else_block) = &if_stmt.else_block {
                    self.emit(" else {");
                    self.indent();
                    self.generate_block(else_block);
                    self.dedent();
                    self.emit("}");
                }
            }
            Statement::Match(_match_stmt) => {
                self.emit("// TODO: Match statement");
            }
            Statement::Loop(loop_stmt) => {
                self.emit("while (1) {");
                self.indent();
                self.generate_block(&loop_stmt.body);
                self.dedent();
                self.emit("}");
            }
        }
    }

    fn generate_expr_inline(&mut self, expr: &Expr) {
        match expr {
            Expr::Literal(lit) => self.generate_literal(lit),
            Expr::Variable(var) => self.write(&var.name),
            Expr::BinaryOp(binop) => {
                self.write("(");
                self.generate_expr_inline(&binop.left);
                self.write(" ");
                self.write(&binop.op);
                self.write(" ");
                self.generate_expr_inline(&binop.right);
                self.write(")");
            }
            Expr::UnaryOp(unop) => {
                self.write(&unop.op);
                self.write("(");
                self.generate_expr_inline(&unop.expr);
                self.write(")");
            }
            Expr::FunctionCall(call) => {
                if let Expr::Variable(func_var) = &*call.func {
                    self.write(&func_var.name);
                }
                self.write("(");
                for (i, arg) in call.args.iter().enumerate() {
                    if i > 0 {
                        self.write(", ");
                    }
                    self.generate_expr_inline(arg);
                }
                self.write(")");
            }
            Expr::FieldAccess(fa) => {
                self.generate_expr_inline(&fa.expr);
                self.write(".");
                self.write(&fa.field);
            }
            Expr::Index(idx) => {
                self.generate_expr_inline(&idx.expr);
                self.write("[");
                self.generate_expr_inline(&idx.index);
                self.write("]");
            }
            Expr::Constructor(ctor) => {
                self.write(&format!("(struct {}) {{ ", ctor.name));
                for (i, arg) in ctor.args.iter().enumerate() {
                    if i > 0 {
                        self.write(", ");
                    }
                    self.generate_expr_inline(arg);
                }
                self.write(" }");
            }
        }
    }

    fn generate_literal(&mut self, lit: &Literal) {
        match lit {
            Literal::Number(n) => self.write(n),
            Literal::String(s) => self.write(&format!("\"{}\"", s.escape_default())),
            Literal::Bool(b) => self.write(if *b { "true" } else { "false" }),
        }
    }

    fn type_to_c(&self, ty: &Type) -> String {
        match ty {
            Type::Primitive(name) => match name.as_str() {
                "i32" => "int32_t".to_string(),
                "i64" => "int64_t".to_string(),
                "f32" => "float".to_string(),
                "f64" => "double".to_string(),
                "bool" => "bool".to_string(),
                "void" => "void".to_string(),
                _ => name.clone(),
            },
            Type::Named(name) => format!("struct {}", name),
            Type::Reference(inner, is_mut) => {
                let base = self.type_to_c(inner);
                if *is_mut {
                    format!("{}*", base)
                } else {
                    format!("const {}*", base)
                }
            }
            Type::Generic(name, _params) => format!("struct {}", name),
            Type::Function(params, ret) => {
                let mut sig = String::new();
                sig.push('(');
                for (i, param) in params.iter().enumerate() {
                    if i > 0 {
                        sig.push_str(", ");
                    }
                    sig.push_str(&self.type_to_c(param));
                }
                sig.push_str(")(");
                sig.push_str(&self.type_to_c(ret));
                sig.push(')');
                sig
            }
        }
    }

    fn emit(&mut self, text: &str) {
        for _ in 0..self.indent_level {
            self.code.push_str("  ");
        }
        self.code.push_str(text);
        self.code.push('\n');
    }

    fn emit_newline(&mut self) {
        self.code.push('\n');
    }

    fn write(&mut self, text: &str) {
        self.code.push_str(text);
    }

    fn indent(&mut self) {
        self.indent_level += 1;
    }

    fn dedent(&mut self) {
        if self.indent_level > 0 {
            self.indent_level -= 1;
        }
    }
}

impl Default for CodeGenerator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_codegen_creation() {
        let gen = CodeGenerator::new();
        assert!(gen.code().is_empty());
    }

    #[test]
    fn test_empty_program() {
        let mut gen = CodeGenerator::new();
        let program = Program { items: vec![] };
        gen.generate_program(&program);
        assert!(gen.code().contains("#include"));
    }

    #[test]
    fn test_type_to_c_primitives() {
        let gen = CodeGenerator::new();
        assert_eq!(gen.type_to_c(&Type::Primitive("i32".to_string())), "int32_t");
        assert_eq!(gen.type_to_c(&Type::Primitive("i64".to_string())), "int64_t");
        assert_eq!(gen.type_to_c(&Type::Primitive("f64".to_string())), "double");
        assert_eq!(gen.type_to_c(&Type::Primitive("bool".to_string())), "bool");
    }

    #[test]
    fn test_type_to_c_reference() {
        let gen = CodeGenerator::new();
        let ref_type = Type::Reference(
            Box::new(Type::Primitive("i32".to_string())),
            false,
        );
        assert_eq!(gen.type_to_c(&ref_type), "const int32_t*");
    }

    #[test]
    fn test_type_to_c_mutable_reference() {
        let gen = CodeGenerator::new();
        let ref_type = Type::Reference(
            Box::new(Type::Primitive("i32".to_string())),
            true,
        );
        assert_eq!(gen.type_to_c(&ref_type), "int32_t*");
    }

    #[test]
    fn test_simple_function_codegen() {
        let mut gen = CodeGenerator::new();
        let func = FunctionDef {
            name: "add".to_string(),
            parameters: vec![
                Parameter {
                    name: "a".to_string(),
                    ty: Type::Primitive("i32".to_string()),
                    span: Span::new("test", 1, 1, 1),
                },
                Parameter {
                    name: "b".to_string(),
                    ty: Type::Primitive("i32".to_string()),
                    span: Span::new("test", 1, 1, 1),
                },
            ],
            return_type: Some(Type::Primitive("i32".to_string())),
            body: Block {
                statements: vec![],
                span: Span::new("test", 1, 1, 1),
            },
            span: Span::new("test", 1, 1, 1),
        };
        gen.generate_function(&func);
        let code = gen.code();
        assert!(code.contains("int32_t add(int32_t a, int32_t b)"));
    }

    #[test]
    fn test_literal_number_codegen() {
        let mut gen = CodeGenerator::new();
        let lit = Expr::Literal(Literal::Number("42".to_string()));
        gen.generate_expr_inline(&lit);
        assert_eq!(gen.code(), "42");
    }

    #[test]
    fn test_literal_string_codegen() {
        let mut gen = CodeGenerator::new();
        let lit = Expr::Literal(Literal::String("hello".to_string()));
        gen.generate_expr_inline(&lit);
        assert_eq!(gen.code(), "\"hello\"");
    }

    #[test]
    fn test_binary_op_codegen() {
        let mut gen = CodeGenerator::new();
        let binop = Expr::BinaryOp(BinaryOp {
            left: Box::new(Expr::Literal(Literal::Number("1".to_string()))),
            op: "+".to_string(),
            right: Box::new(Expr::Literal(Literal::Number("2".to_string()))),
            span: Span::new("test", 1, 1, 1),
        });
        gen.generate_expr_inline(&binop);
        assert_eq!(gen.code(), "(1 + 2)");
    }

    #[test]
    fn test_variable_codegen() {
        let mut gen = CodeGenerator::new();
        let var = Expr::Variable(Variable {
            name: "x".to_string(),
            span: Span::new("test", 1, 1, 1),
        });
        gen.generate_expr_inline(&var);
        assert_eq!(gen.code(), "x");
    }
}
