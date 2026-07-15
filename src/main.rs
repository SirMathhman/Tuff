use core::panic;
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};

type CompileError = String;

/// Generic struct template: (name, type_params, fields_str).
#[allow(dead_code)]
#[derive(Clone)]
struct GenericStructTemplate {
    name: String,
    type_params: Vec<String>,
    fields_str: String,
}

/// Generic function template: (name, type_params, param_names, body).
#[allow(dead_code)]
#[derive(Clone)]
struct GenericFunctionTemplate {
    name: String,
    type_params: Vec<String>,
    param_names: Vec<String>,
    body: String,
}

/// Shared compilation context passed between compiler functions.
struct CompileContext {
    vars: Vec<String>,
    var_idx: usize,
    mutable_vars: Vec<String>,
    declared_vars: HashSet<String>,
    #[allow(dead_code)]
    var_types: HashMap<String, Vec<String>>, // variable name -> list of possible types (union support)
    type_aliases: HashMap<String, Vec<String>>, // alias name -> list of member types (union support)
    union_types: HashMap<String, Vec<String>>,  // union alias -> list of struct variant names
    tagged_union_vars: HashSet<String>, // variables that are tagged unions (if/else with different struct variants)
    generated_structs: Vec<String>,     // C typedef structs
    defined_structs: HashSet<String>,   // struct names already defined
    generic_structs: Vec<GenericStructTemplate>, // generic struct templates
    generated_instantiations: HashSet<String>, // already-generated monomorphized names
    generic_functions: Vec<GenericFunctionTemplate>, // generic function templates
    generated_function_instantiations: HashSet<String>, // already-generated monomorphized function names
    generated_functions: Vec<(String, Vec<String>, String)>, // (name, param_names, c_code)
}

impl CompileContext {
    /// Create a new context with the given variable names.
    fn new(vars: Vec<String>) -> Self {
        Self {
            vars,
            var_idx: 0,
            mutable_vars: Vec::new(),
            declared_vars: HashSet::new(),
            var_types: HashMap::new(),
            type_aliases: HashMap::new(),
            union_types: HashMap::new(),
            tagged_union_vars: HashSet::new(),
            generated_structs: Vec::new(),
            defined_structs: HashSet::new(),
            generic_structs: Vec::new(),
            generated_instantiations: HashSet::new(),
            generic_functions: Vec::new(),
            generated_function_instantiations: HashSet::new(),
            generated_functions: Vec::new(),
        }
    }
}

/// Tracks read calls in source order with their types for correct C code generation.
#[allow(dead_code)]
struct ReadTracker {
    reads: Vec<(usize, ReadType)>,
}

impl ReadTracker {
    #[allow(dead_code)]
    fn track(&mut self, pos: usize, read_type: ReadType) {
        self.reads.push((pos, read_type));
    }
}

#[derive(Clone)]
enum ReadType {
    Int,
    Bool,
}

static TEMP_COUNTER: AtomicU32 = AtomicU32::new(0);

/// Strip fn bodies from source for top-level read tracking.
/// Replaces "fn name(...) => body;" with empty string so reads inside fn aren't counted at main level.
fn strip_fn_bodies(source: &str) -> String {
    let mut result = String::new();
    let mut i = 0;

    while i < source.len() {
        if source[i..].starts_with("fn ")
            && (i == 0 || !source[..i].chars().last().unwrap_or(' ').is_alphanumeric())
        {
            // Skip past "fn name" to the opening paren
            let start = i;
            i += 3; // skip "fn "
            // Find '('
            while i < source.len() && source.as_bytes()[i] != b'(' {
                i += 1;
            }
            if i < source.len() {
                // Skip to matching ')'
                let paren_end = find_matching_paren(&source[i..]);
                if let Some(end) = paren_end {
                    i = i + end + 1;
                    // Skip past optional return type annotation (e.g., ": I32") and find "=>"
                    while i < source.len() && !source[i..].starts_with("=>") {
                        i += 1;
                    }
                    if source[i..].starts_with("=>") {
                        i += 2; // skip "=>"
                    }
                    // Now find the semicolon that ends this fn definition (at top level)
                    let semi_pos = find_top_level_semicolon(&source[i..]);
                    if let Some(s) = semi_pos {
                        i = i + s + 1;
                    } else {
                        result.push_str(&source[start..]);
                        break;
                    }
                } else {
                    // No matching paren, just copy from start
                    result.push(source.as_bytes()[start] as char);
                    i = start + 1;
                }
            } else {
                result.push_str(&source[start..]);
            }
        } else {
            let ch_len = source[i..].chars().next().unwrap_or('\0').len_utf8();
            result.push(source[i..i + ch_len].chars().next().unwrap());
            i += ch_len;
        }
    }

    result
}

fn main() {
    let source = std::fs::read_to_string("main.tuff")
        .expect("Failed to read main.tuff");
    let c_code = compile(&source).expect("Compilation failed");
    std::fs::write("main.c", c_code).expect("Failed to write main.c");
}

/// Find all read calls in source order and classify them by type.
fn find_reads_in_order(source: &str) -> Vec<(usize, ReadType)> {
    let mut reads = Vec::new();
    let mut i = 0;
    while i < source.len() {
        if source[i..].starts_with("read<Bool>()") {
            reads.push((i, ReadType::Bool));
            i += "read<Bool>()".len();
        } else if source[i..].starts_with("read()") {
            reads.push((i, ReadType::Int));
            i += "read()".len();
        } else {
            i += 1;
        }
    }
    reads
}

/// Parse generic type parameters from a string like "name<T, U>" -> ("name", ["T", "U"]).
fn parse_generic_params(raw: &str) -> Result<(String, Vec<String>), CompileError> {
    if let Some(angle_start) = raw.find('<') {
        if let Some(angle_end) = raw.find('>') {
            let name = raw[..angle_start].trim().to_string();
            let params: Vec<String> = raw[angle_start + 1..angle_end]
                .split(',')
                .map(|p| p.trim().to_string())
                .collect();
            Ok((name, params))
        } else {
            Err(format!("Invalid syntax: missing closing '>' in {}", raw))
        }
    } else {
        Ok((raw.to_string(), Vec::new()))
    }
}

/// Generate a C function string from compiled body parts and read entries.
fn build_c_function(
    func_name: &str,
    param_names: &[String],
    fn_read_entries: &[(usize, ReadType)],
    fn_body_stmts: &str,
    fn_return_expr: &str,
) -> String {
    let param_sig: Vec<String> = param_names.iter().map(|n| format!("int {}", n)).collect();
    let sig_str = if param_sig.is_empty() {
        "void"
    } else {
        &param_sig.join(", ")
    };
    let mut c_func = format!("int {}({}) {{\n", func_name, sig_str);

    // Add local reads after parameters
    if !fn_read_entries.is_empty() {
        for (i, (_pos, entry_type)) in fn_read_entries.iter().enumerate() {
            let var_name = &format!("v{}", i);
            match entry_type {
                ReadType::Int => {
                    c_func.push_str(&format!("\t\tint {};\n", var_name));
                    c_func.push_str(&format!("\t\tscanf(\"%d\", &{});\n", var_name));
                }
                ReadType::Bool => {
                    c_func.push_str(&format!("\t\tint {};\n", var_name));
                    c_func.push_str(&format!("\t\tchar buf[64];\n"));
                    c_func.push_str(&format!(
                        "\t\tscanf(\"%63s\", buf);{} = strcmp(buf, \"true\") == 0 || buf[0] == '1';\n",
                        var_name
                    ));
                }
            }
        }
    }

    if !fn_body_stmts.is_empty() {
        c_func.push_str(fn_body_stmts);
    }
    c_func.push_str(&format!("\t\treturn {};\n}}\n", fn_return_expr));
    c_func
}

/// Compile function arguments and generate a C function call string.
fn compile_fn_call(
    func_name: &str,
    args_str: &str,
    ctx: &mut CompileContext,
) -> Result<String, CompileError> {
    let mut compiled_args: Vec<String> = Vec::new();
    if !args_str.is_empty() {
        for arg in args_str.split(',') {
            let (_, arg_result) = compile_expression(arg.trim(), ctx)?;
            compiled_args.push(arg_result);
        }
    }
    Ok(format!("{}({})", func_name, compiled_args.join(", ")))
}

/// Convert a struct name to lowercase-first for C field naming.
fn to_lower_first(s: &str) -> String {
    let mut lower_name = String::new();
    for (i, c) in s.chars().enumerate() {
        if i == 0 {
            lower_name.push(c.to_lowercase().next().unwrap());
        } else {
            lower_name.push(c);
        }
    }
    lower_name
}

/// Generate C struct typedefs.
fn generate_struct_typedefs(ctx: &CompileContext) -> String {
    let mut c_structs = String::new();
    for s in &ctx.generated_structs {
        c_structs.push_str(s);
        c_structs.push('\n');
    }
    c_structs
}

/// Generate C tagged union typedefs for union types with struct members.
fn generate_union_typedefs(ctx: &CompileContext) -> String {
    let mut c_unions = String::new();
    for (alias_name, struct_members) in &ctx.union_types {
        let tag_variants: Vec<String> = struct_members
            .iter()
            .map(|s| format!("Tag_{}", s))
            .collect();
        c_unions.push_str(&format!(
            "typedef enum {{ {} }} {}_tag;\n",
            tag_variants.join(", "),
            alias_name
        ));
        let data_members: Vec<String> = struct_members
            .iter()
            .map(|s| format!("{} {}", s, to_lower_first(s)))
            .collect();
        c_unions.push_str(&format!(
            "typedef struct {{ {}_tag tag; union {{ {} }} data; }} {};\n",
            alias_name,
            data_members.join("; "),
            alias_name
        ));
    }
    c_unions
}

/// Generate both struct and union typedefs.
fn generate_typedefs(ctx: &CompileContext) -> (String, String) {
    let c_structs = generate_struct_typedefs(ctx);
    let c_unions = generate_union_typedefs(ctx);
    (c_structs, c_unions)
}

/// Generate C code for tagged union if/else assignment.
/// Converts "if (cond) Ok { ... } else Err { ... }" to:
/// "if (cond) { var.tag = Tag_Ok; var.data.okVal = (Ok){...}; } else { var.tag = Tag_Err; var.data.errVal = (Err){...}; }"
fn generate_tagged_union_if_else(
    rhs: &str,
    var_name: &str,
    _union_type: &str,
    _struct_members: &[String],
    ctx: &mut CompileContext,
) -> Result<String, CompileError> {
    // Parse the if/else expression
    if !rhs.starts_with("if ") {
        return Err("Expected if/else expression".to_string());
    }
    // Inline parse_cond_and_rest logic
    let after_kw = &rhs[3..];
    let paren_end = find_matching_paren(after_kw).ok_or("Failed to parse if condition")?;
    let cond = &after_kw[1..paren_end];
    let rest = &after_kw[paren_end + 2..].trim();
    let (cond, rest) = (cond, rest);

    // Find else keyword
    let else_pos = find_top_level_else(rest).ok_or("Expected else branch")?;
    let then_expr = &rest[..else_pos].trim();
    let else_expr = &rest[else_pos + "else".len()..].trim();

    // Compile condition
    let (_, cond_result) = compile_expression(cond, ctx)?;

    // Determine which struct variant is in each branch
    let then_variant = then_expr.split_whitespace().next().unwrap_or("");
    let else_variant = else_expr.split_whitespace().next().unwrap_or("");

    // Build tag and data field names
    let then_tag = format!("Tag_{}", then_variant);
    let else_tag = format!("Tag_{}", else_variant);
    let then_data_field = to_lower_first(then_variant);
    let else_data_field = to_lower_first(else_variant);

    // Compile then/else expressions to get struct initializers
    let (_, then_result) = compile_expression(then_expr, ctx)?;
    let (_, else_result) = compile_expression(else_expr, ctx)?;

    Ok(format!(
        "if ({}) {{ {} .tag = {}; {} .data.{} = {}; }} else {{ {} .tag = {}; {} .data.{} = {}; }}",
        cond_result,
        var_name,
        then_tag,
        var_name,
        then_data_field,
        then_result,
        var_name,
        else_tag,
        var_name,
        else_data_field,
        else_result
    ))
}

fn compile(source: &str) -> Result<String, CompileError> {
    let trimmed = source.trim();
    eprintln!("[compile] source: '{}'", trimmed);
    if trimmed.is_empty() {
        return Ok(String::from("int main() {\n\treturn 0;\n}\n"));
    }

    // Strip fn bodies from source before scanning for top-level reads.
    let stripped_for_reads = strip_fn_bodies(trimmed);

    // Find all reads in source order and assign variables sequentially.
    let read_entries = find_reads_in_order(&stripped_for_reads);
    let read_count = read_entries.len();
    let vars: Vec<String> = (0..read_count).map(|i| format!("v{}", i)).collect();

    // Parse let declarations and build C body
    let mut ctx = CompileContext::new(vars.clone());
    let (c_body, return_expr) = compile_expression(trimmed, &mut ctx)?;

    if read_count > 0 {
        // Generate C code for reads in source order.
        let mut c_decls = String::new();
        let mut c_reads = String::new();

        for (i, (_pos, entry_type)) in read_entries.iter().enumerate() {
            let var_name = &vars[i];
            match entry_type {
                ReadType::Int => {
                    c_decls.push_str(&format!("\tint {};\n", var_name));
                    c_reads.push_str(&format!("\tscanf(\"%d\", &{});\n", var_name));
                }
                ReadType::Bool => {
                    c_decls.push_str(&format!("\tint {};\n", var_name));
                    // Use scanf("%s") to read a single whitespace-delimited token, then compare.
                    c_reads.push_str(&format!(
                        "\tscanf(\"%63s\", buf);\n{} = strcmp(buf, \"true\") == 0 || buf[0] == '1';\n",
                        var_name
                    ));
                }
            }
        }

        // Build final C program with stdbool.h for boolean support
        let has_bool_reads = read_entries
            .iter()
            .any(|(_, t)| matches!(t, ReadType::Bool));
        let includes = if has_bool_reads {
            "#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>"
        } else {
            "#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>"
        };
        let buf_decl = if has_bool_reads {
            "\tchar buf[64];"
        } else {
            ""
        };

        let (c_prototypes, c_functions) = generate_function_code(&ctx.generated_functions);

        // Generate struct and union typedefs
        let (c_structs, c_unions) = generate_typedefs(&ctx);

        let final_return = if return_expr.is_empty() {
            "0".to_string()
        } else {
            return_expr
        };
        Ok(format!(
            "{}\n{}\n{}int main() {{\n{}\n{}\n\t{}\n\t{}\n\treturn {};\n}}\n",
            includes,
            format!(
                "{}\n{}\n{}",
                c_structs.trim(),
                c_unions.trim(),
                c_prototypes.trim()
            ),
            c_functions.trim(),
            buf_decl,
            c_decls.trim(),
            c_reads.trim(),
            c_body,
            final_return
        ))
    } else {
        let (c_prototypes, c_functions) = generate_function_code(&ctx.generated_functions);

        // Generate struct and union typedefs
        let (c_structs, c_unions) = generate_typedefs(&ctx);

        // Check if any variable is of type &Str (needs string.h for strlen)
        let has_str_type = ctx
            .var_types
            .values()
            .any(|types| types.iter().any(|t| t == "&Str"));

        // Include stdio.h if any generated functions use scanf (have local reads) or structs exist
        let includes = if !c_functions.is_empty() || !c_structs.is_empty() || has_str_type {
            "#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>"
        } else {
            ""
        };

        let final_return = if return_expr.is_empty() {
            "0".to_string()
        } else {
            return_expr
        };
        Ok(format!(
            "{}\n{}\n{}int main() {{\n\t{}\n\treturn {};\n}}\n",
            includes,
            format!(
                "{}\n{}\n{}",
                c_structs.trim(),
                c_unions.trim(),
                c_prototypes.trim()
            ),
            c_functions.trim(),
            c_body,
            final_return
        ))
    }
}

/// Generate C function prototypes and definitions from compiled functions.
fn generate_function_code(functions: &[(String, Vec<String>, String)]) -> (String, String) {
    let mut c_prototypes = String::new();
    for (name, params, _func_code) in functions {
        if params.is_empty() {
            c_prototypes.push_str(&format!("int {}(void);\n", name));
        } else {
            let param_sig: Vec<String> = params.iter().map(|p| format!("int {}", p)).collect();
            c_prototypes.push_str(&format!("int {}({});\n", name, param_sig.join(", ")));
        }
    }

    let mut c_functions = String::new();
    for (_name, _params, func_code) in functions {
        c_functions.push_str(func_code);
        c_functions.push('\n');
    }

    (c_prototypes, c_functions)
}

/// Parse a let declaration, extracting the variable name, mutability, and optional type annotation.
fn parse_let_declaration(decl: &str) -> (&str, bool, Option<String>) {
    // Find '=' position (top-level, not inside brackets)
    let eq_pos = find_top_level_char(decl, '=');
    let before_eq = if let Some(pos) = eq_pos {
        &decl[..pos]
    } else {
        decl
    };

    // Strip "mut " prefix if present
    let after_mut = if let Some(stripped) = before_eq.strip_prefix("mut ") {
        (stripped, true)
    } else {
        (before_eq, false)
    };

    // Check for type annotation: "x : Type"
    if let Some(colon_pos) = after_mut.0.find(':') {
        let var_name = after_mut.0[..colon_pos].trim();
        let type_name = after_mut.0[colon_pos + 1..].trim();
        (var_name, after_mut.1, Some(type_name.to_string()))
    } else {
        let var_name = after_mut.0.split_whitespace().next().unwrap_or("x");
        (var_name, after_mut.1, None)
    }
}

/// Parse the expected size from an array type annotation like "[I32; 1]" or "[u8; 4]".
fn parse_array_size(ty: &str) -> Option<usize> {
    let trimmed = ty.trim();
    if !trimmed.starts_with('[') || !trimmed.ends_with(']') {
        return None;
    }
    let inner = &trimmed[1..trimmed.len() - 1];
    if let Some(semi_pos) = inner.find(';') {
        let size_part = inner[semi_pos + 1..].trim();
        size_part.parse().ok()
    } else {
        None
    }
}

/// Find the index of a character at the top level (not inside any braces or brackets).
fn find_top_level_char(s: &str, target: char) -> Option<usize> {
    let mut brace_depth = 0;
    let mut bracket_depth = 0;
    for (i, ch) in s.chars().enumerate() {
        match ch {
            '{' => brace_depth += 1,
            '}' => brace_depth -= 1,
            '[' => bracket_depth += 1,
            ']' => bracket_depth -= 1,
            c if brace_depth == 0 && bracket_depth == 0 && c == target => return Some(i),
            _ => {}
        }
    }
    None
}

/// Parse array repeat syntax [value; count], returning (value_str, count) if it matches.
fn parse_array_repeat(s: &str) -> Option<(&str, usize)> {
    let closing_bracket = find_matching_bracket(s)?;
    let inner = &s[1..closing_bracket];
    // Must have exactly one ';' at top level
    let semi_pos = find_top_level_char(inner, ';')?;
    let value_part = inner[..semi_pos].trim();
    let count_part = inner[semi_pos + 1..].trim();
    let count = count_part.parse().ok()?;
    Some((value_part, count))
}

/// Parse the contents of an array literal, returning the items and the closing bracket position.
fn parse_array_items(s: &str) -> Option<(Vec<&str>, usize)> {
    let closing_bracket = find_matching_bracket(s)?;
    let array_content = &s[1..closing_bracket];
    let items: Vec<&str> = if array_content.trim().is_empty() {
        vec![]
    } else {
        array_content.split(',').map(|item| item.trim()).collect()
    };
    Some((items, closing_bracket))
}

/// Recursively compile an array declaration, handling nested arrays.
/// Returns (C declaration statement, return expression for final part).
fn compile_array_decl(
    var_name: &str,
    array_expr: &str,
    final_part: &str,
    ctx: &mut CompileContext,
) -> Result<(String, String), CompileError> {
    let trimmed = array_expr.trim();
    debug_assert!(trimmed.starts_with('['));

    // Check for array repeat syntax: [value; count]
    if let Some((repeat_value, repeat_count)) = parse_array_repeat(trimmed) {
        let (val_body, val_result) = compile_expression(repeat_value, ctx)?;
        let repeated: Vec<_> = (0..repeat_count).map(|_| val_result.clone()).collect();
        let init = format!("{{{}}}", repeated.join(", "));
        let c_decl = format!(
            "{}\n\tint {}[{}] = {};",
            val_body, var_name, repeat_count, init
        );
        let (final_body, final_result) = compile_expression(final_part, ctx)?;
        return Ok((format!("{}\n{}", c_decl, final_body), final_result));
    }

    if let Some((items, _closing_bracket)) = parse_array_items(trimmed) {
        let len = items.len();

        // Check if any item is itself an array literal
        let has_nested_arrays = items.iter().any(|item| item.trim().starts_with('['));

        if has_nested_arrays && len > 0 {
            // Determine inner dimensions by recursively compiling first element
            let (first_body, first_init, inner_dims) = compile_array_item(&items[0], ctx)?;

            // Compile remaining items
            let mut compiled_items = vec![first_init];
            let mut body = first_body;
            for item in &items[1..] {
                let (item_body, item_init, _) = compile_array_item(item, ctx)?;
                body.push_str(&item_body);
                compiled_items.push(item_init);
            }

            // Build multidimensional array: int name[len][inner_dims] = { items };
            let dims = if inner_dims.is_empty() {
                format!("[{}]", len)
            } else {
                format!("[{}]{}", len, inner_dims)
            };

            let c_decl = format!(
                "{}\n\tint {}{} = {{{}}};;",
                body,
                var_name,
                dims,
                compiled_items.join(", ")
            );
            let (final_body, final_result) = compile_expression(final_part, ctx)?;
            return Ok((format!("{}\n{}", c_decl, final_body), final_result));
        } else {
            // Flat array - compile each element as an expression
            let mut compiled_items = Vec::new();
            let mut body = String::new();
            for item in &items {
                let (item_body, item_result) = compile_expression(item, ctx)?;
                body.push_str(&item_body);
                compiled_items.push(item_result);
            }

            let c_decl = format!(
                "{}\n\tint {}[{}] = {{{}}};",
                body,
                var_name,
                len,
                compiled_items.join(", ")
            );
            let (final_body, final_result) = compile_expression(final_part, ctx)?;
            return Ok((format!("{}\n{}", c_decl, final_body), final_result));
        }
    }

    // Fallback: treat as scalar
    let (decl_body, decl_result) = compile_expression(array_expr, ctx)?;
    let c_body = format!("{}\n\tint {} = {};", decl_body, var_name, decl_result);
    let (final_body, final_result) = compile_expression(final_part, ctx)?;
    Ok((format!("{}\n{}", c_body, final_body), final_result))
}

/// Compile a single array item, returning (body statements, initializer string, dimension suffix).
/// Dimension suffix is like "[3]" for an inner array of size 3.
fn compile_array_item(
    item: &str,
    ctx: &mut CompileContext,
) -> Result<(String, String, String), CompileError> {
    let trimmed = item.trim();

    if trimmed.starts_with('[') {
        // Nested array - recurse
        if let Some((items, _closing_bracket)) = parse_array_items(trimmed) {
            let len = items.len();

            let mut compiled_items = Vec::new();
            let mut body = String::new();
            let mut has_nested = false;

            for sub_item in &items {
                let (sub_body, sub_result, sub_dims) = compile_array_item(sub_item, ctx)?;
                body.push_str(&sub_body);
                compiled_items.push(sub_result);
                if !sub_dims.is_empty() {
                    has_nested = true;
                }
            }

            if has_nested && !compiled_items.is_empty() {
                let dims = format!("[{}]", len);
                let init = format!("{{{}}}", compiled_items.join(", "));
                return Ok((body, init, dims));
            }

            let dims = format!("[{}]", len);
            let init = format!("{{{}}}", compiled_items.join(", "));
            Ok((body, init, dims))
        } else {
            // Malformed - fall through to expression compilation
            let (body, result) = compile_expression(trimmed, ctx)?;
            Ok((body, result, String::new()))
        }
    } else {
        // Scalar item
        let (body, result) = compile_expression(trimmed, ctx)?;
        Ok((body, result, String::new()))
    }
}

/// Recursively compile a Tuff expression, returning (C statements, return expression).
fn compile_expression(
    expr: &str,
    ctx: &mut CompileContext,
) -> Result<(String, String), CompileError> {
    let trimmed = expr.trim();
    eprintln!("[compile_expr] expr: '{}'", trimmed);

    // Handle empty expressions.
    if trimmed.is_empty() {
        return Ok((String::new(), String::from("")));
    }

    // Check for plain reassignment: "x = <expr>; <final>" (no "let", no "if", no "while", no "for", no "fn", no "type")
    if !trimmed.starts_with("let ")
        && !trimmed.starts_with('{')
        && !trimmed.starts_with("if ")
        && !trimmed.starts_with("while ")
        && !trimmed.starts_with("for ")
        && !trimmed.starts_with("fn ")
        && !trimmed.starts_with("struct ")
        && !trimmed.starts_with("type ")
    {
        if let Some(semi_pos) = find_top_level_semicolon(trimmed) {
            let assign_part = &trimmed[..semi_pos];
            let final_part = &trimmed[semi_pos + 1..];
            // Check if it's an assignment (contains '=' at top level)
            if let Some(eq_pos) = find_top_level_char(assign_part, '=') {
                // Check for compound assignment operators: += -= *= /=
                // The '=' found by find_top_level_char is the one in "+=" etc., so look back 1 char.
                let (var_name, op, rhs_start_offset) = if eq_pos >= 1 {
                    let prev_ch = assign_part.chars().nth(eq_pos - 1);
                    match prev_ch {
                        Some('+') => (&assign_part[..eq_pos - 1], Some('+'), eq_pos + 1), // skip '=' only
                        Some('-') => (&assign_part[..eq_pos - 1], Some('-'), eq_pos + 1),
                        Some('*') => (&assign_part[..eq_pos - 1], Some('*'), eq_pos + 1),
                        Some('/') => (&assign_part[..eq_pos - 1], Some('/'), eq_pos + 1),
                        _ => (&assign_part[..eq_pos], None, eq_pos + 1), // plain '='
                    }
                } else {
                    (&assign_part[..eq_pos], None, eq_pos + 1)
                };
                let var_name = var_name.trim();
                // Extract base variable name (e.g., "x" from "x[0]")
                let base_var = var_name.split('[').next().unwrap_or(var_name);
                // Check if variable was declared as mutable
                if !ctx.mutable_vars.iter().any(|v| v == base_var) {
                    return Err(format!("Cannot reassign immutable variable '{}'", base_var));
                }
                let rhs = assign_part[rhs_start_offset..].trim();
                let (assign_body, assign_result) = compile_expression(rhs, ctx)?;
                let c_body = match op {
                    Some(op_char) => format!(
                        "{}\n\t{} {}= {};",
                        assign_body, var_name, op_char, assign_result
                    ),
                    None => format!("{}\n\t{} = {};", assign_body, var_name, assign_result),
                };
                let final_result = compile_expression(final_part, ctx).map(|r| r.1)?;
                return Ok((c_body, final_result));
            }
        }
    }

    // Check for let declaration pattern: "let x = <expr>; <final>"
    if let Some(decl_expr) = trimmed.strip_prefix("let ") {
        // Find the top-level semicolon (not inside braces)
        if let Some(semi_pos) = find_top_level_semicolon(decl_expr) {
            let decl_part = &decl_expr[..semi_pos];
            let final_part = &decl_expr[semi_pos + 1..];

            // Extract variable name, mutability, and optional type annotation
            let (var_name, is_mut, type_annotation) = parse_let_declaration(decl_part);

            // Track mutable variables
            if is_mut {
                ctx.mutable_vars.push(var_name.to_string());
            }

            // Extract the expression after '=' (split only on first '=')
            let after_eq = decl_part.splitn(2, '=').nth(1).unwrap_or("").trim();

            // Check for array literal: [expr1, expr2, ...]
            if after_eq.starts_with('[') {
                if let Some(closing_bracket) = find_matching_bracket(after_eq) {
                    // Count items in the array
                    let array_content = &after_eq[1..closing_bracket];
                    let item_count = if array_content.trim().is_empty() {
                        0
                    } else {
                        array_content.split(',').count()
                    };

                    // If there's a non-array type annotation, this is a type error
                    if let Some(ty) = &type_annotation {
                        let upper = ty.to_uppercase();
                        if !upper.contains("ARRAY") && !upper.contains('[') {
                            return Err(format!("Type mismatch: expected {} but got array", ty));
                        }
                        // Check array size if type specifies one (e.g., [I32; 1])
                        if let Some(expected_size) = parse_array_size(ty) {
                            if item_count != expected_size {
                                return Err(format!(
                                    "Array size mismatch: expected {} but got {}",
                                    expected_size, item_count
                                ));
                            }
                        }
                    }
                    return compile_array_decl(var_name, after_eq, final_part, ctx);
                }
            }

            // If type annotation expects an array but RHS is not an array literal, error
            if let Some(ty) = &type_annotation {
                if ty.contains('[') && !after_eq.starts_with('[') {
                    return Err(format!(
                        "Type mismatch: expected array but got {}",
                        after_eq
                    ));
                }
            }

            // Check if this is a union type assignment with if/else (tagged union)
            let is_union_if_else = type_annotation
                .as_ref()
                .and_then(|ty| {
                    let resolved = resolve_type_alias_set(ctx, ty);
                    // Check if any resolved type is a struct in union_types
                    ctx.union_types.get(ty.as_str()).or_else(|| {
                        for rty in &resolved {
                            if let Some(members) = ctx.union_types.get(rty.as_str()) {
                                return Some(members);
                            }
                        }
                        None
                    })
                })
                .is_some()
                && after_eq.starts_with("if ");

            // Recursively compile the declaration's expression (skip for union if/else - handled separately)
            let (decl_body, decl_result) = if is_union_if_else {
                (String::new(), String::new())
            } else {
                compile_expression(after_eq, ctx)?
            };

            // Handle shadowing: if variable already declared, generate assignment instead of redeclaration
            let c_decl = if ctx.declared_vars.contains(var_name) {
                format!("{}\n\t{} = {};", decl_body, var_name, decl_result)
            } else {
                ctx.declared_vars.insert(var_name.to_string());
                // Resolve type annotation: handle generic types like "Wrapper<I32>" -> "Wrapper_I32"
                // Also handle union type aliases: "Result" -> ["Ok", "Err"]
                let all_resolved_types = type_annotation
                    .as_ref()
                    .map(|ty| resolve_type_alias_set(ctx, ty))
                    .unwrap_or_else(|| vec![]);
                // Determine which struct type is actually instantiated from the RHS
                // e.g., "Ok { value : read() }" -> "Ok" or "Wrapper<I32> { ... }" -> "Wrapper_I32"
                // Only returns Some if the RHS is a struct instantiation (not a plain expression like "100")
                let rhs_concrete_name = after_eq.split_whitespace().next().and_then(|word| {
                    // Check for generic instantiation: "Wrapper<I32>" -> "Wrapper_I32"
                    if let Some(angle_start) = word.find('<') {
                        if let Some(angle_end) = word.find('>') {
                            let base = &word[..angle_start];
                            let type_args_str = &word[angle_start + 1..angle_end];
                            let concrete_name = build_concrete_name(base, type_args_str);
                            // Only return if the base is a defined struct (generic or concrete)
                            if ctx.defined_structs.contains(base)
                                || ctx.defined_structs.contains(&concrete_name)
                            {
                                return Some(concrete_name);
                            }
                            return None;
                        }
                    }
                    // Non-generic struct: "Ok" -> "Ok" (only if it's a defined struct)
                    let base = word.split('<').next().unwrap_or(word);
                    if ctx.defined_structs.contains(base) {
                        Some(base.to_string())
                    } else {
                        None
                    }
                });
                // For union types, pick the struct that matches the RHS instantiation
                let resolved_struct_type = rhs_concrete_name.clone().or_else(|| {
                    all_resolved_types
                        .iter()
                        .find(|ty| ctx.defined_structs.contains(*ty))
                        .cloned()
                });
                // If no struct found, check for generic instantiation from type annotation
                let resolved_generic_type = resolved_struct_type.clone().or_else(|| {
                    type_annotation.as_ref().and_then(|ty| {
                        parse_generic_type(ty).map(|(base, type_args_str)| build_concrete_name(base, type_args_str))
                    })
                });
                // Track all resolved types for `is` operator checks (union support)
                let inferred_type = type_annotation
                    .as_ref()
                    .cloned()
                    .unwrap_or_else(|| infer_literal_type(after_eq));
                let tracked_types = if !all_resolved_types.is_empty() {
                    all_resolved_types.clone()
                } else {
                    vec![resolve_type_alias(ctx, &inferred_type)]
                };
                ctx.var_types.insert(var_name.to_string(), tracked_types);
                // For union types with if/else, generate tagged union assignment
                if is_union_if_else {
                    if let Some(ref ty) = type_annotation {
                        let struct_members_clone = ctx.union_types.get(ty.as_str()).cloned();
                        if let Some(struct_members) = struct_members_clone {
                            // Mark this variable as a tagged union
                            ctx.tagged_union_vars.insert(var_name.to_string());
                            // Generate: Type var; if (cond) { var.tag = Tag_Then; var.data.thenVal = ...; } else { ... }
                            // Don't call compile_expression on after_eq first - let generate_tagged_union_if_else handle it
                            let tagged_if_else = generate_tagged_union_if_else(
                                after_eq,
                                var_name,
                                ty,
                                &struct_members,
                                ctx,
                            )
                            .unwrap_or_else(|_| format!("{} = {};", var_name, decl_result));
                            format!(
                                "{}\n\t{} {};\n\t{}",
                                decl_body, ty, var_name, tagged_if_else
                            )
                        } else {
                            format!("{}\n\t{} {} = {};", decl_body, ty, var_name, decl_result)
                        }
                    } else {
                        let c_type = tuff_type_to_c(ctx, &inferred_type)?;
                        format!(
                            "{}\n\t{} {} = {};",
                            decl_body, c_type, var_name, decl_result
                        )
                    }
                } else {
                    // Use struct type name if it's a defined struct, otherwise convert type
                    let c_type = if let Some(ref ty) = resolved_generic_type {
                        " ".to_string() + ty
                    } else {
                        format!(" {}", tuff_type_to_c(ctx, &inferred_type)?)
                    };
                    format!(
                        "{}\n\t{} {} = {};",
                        decl_body, c_type, var_name, decl_result
                    )
                }
            };

            let (final_body, final_result) = compile_expression(final_part, ctx)?;
            return Ok((format!("{}\n{}", c_decl, final_body), final_result));
        }
    }

    // Handle blocks { ... } - check if block contains let declarations or assignments
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        let inner = &trimmed[1..trimmed.len() - 1].trim();
        // If inner content has statements (let decls, assignments with semicolons), process recursively
        if inner.contains("let ") || find_top_level_semicolon(inner).is_some() {
            let (block_body, block_result) = compile_expression(inner, ctx)?;
            return Ok((block_body, block_result));
        }
        // Otherwise convert to parentheses for grouping expressions
        let mut result = String::new();
        result.push('(');
        for ch in inner.chars() {
            match ch {
                '{' => result.push('('),
                '}' => result.push(')'),
                _ => result.push(ch),
            }
        }
        result.push(')');
        return Ok((String::new(), result));
    }

    // Check if expression contains embedded blocks with statements (let decls or assignments)
    // e.g., "read() + { let x = read(); x }"  OR  "{ x = read(); } x"
    // We look for any block that has internal semicolons (statements, not just grouping).
    // Skip this check if the expression starts with "if " - let the if/else handler deal with brace-delimited branches.
    if !trimmed.starts_with("if ")
        && trimmed.contains('{')
        && (find_top_level_semicolon(trimmed).is_some()
            || trimmed.contains("{ let ")
            || trimmed.contains("= "))
    {
        for (brace_pos, ch) in trimmed.char_indices() {
            if ch == '{' {
                let remaining = &trimmed[brace_pos..];
                if let Some(block_len) = find_matching_brace(remaining) {
                    // block_content is between { and }, exclusive of both
                    let content_start = brace_pos + 1;
                    let content_end = brace_pos + block_len; // closing brace position (exclusive)
                    let block_content = &trimmed[content_start..content_end].trim();

                    // Only treat as statement block if it contains semicolons or let declarations inside
                    let has_statements = find_top_level_semicolon(block_content).is_some()
                        || block_content.contains("let ");
                    if !has_statements {
                        continue;
                    }

                    let before = &trimmed[..brace_pos];
                    let after = &trimmed[brace_pos + block_len + 1..];

                    // Compile "before" FIRST (source order), then the block's statements
                    let (before_body, before_result) = if !before.trim().is_empty() {
                        compile_expression(before.trim(), ctx)?
                    } else {
                        (String::new(), String::new())
                    };

                    let (block_body, block_result) = compile_expression(block_content, ctx)?;

                    if !before.trim().is_empty() {
                        let combined_body = format!("{}{}", before_body, block_body);

                        if !after.trim().is_empty() {
                            // "after" provides the final return expression
                            let (_, after_result) = compile_expression(after.trim(), ctx)?;
                            let combined_expr =
                                format!("{}({}){}", before_result, block_result, after_result);
                            return Ok((combined_body, combined_expr));
                        } else {
                            // Block is the final part of expression: before(block_result)
                            let combined_expr = format!("{}({})", before_result, block_result);
                            return Ok((combined_body, combined_expr));
                        }
                    } else if !after.trim().is_empty() {
                        // No "before", but there's an expression after the block
                        let (_, after_result) = compile_expression(after.trim(), ctx)?;
                        return Ok((block_body, after_result));
                    } else {
                        return Ok((block_body, block_result));
                    }
                }
            }
        }
    }

    // Helper: parse "keyword (cond) rest" → (&cond, &rest)
    fn parse_cond_and_rest(input: &str, keyword_len: usize) -> Option<(&str, &str)> {
        let after_kw = &input[keyword_len..];
        let paren_end = find_matching_paren(after_kw)?;
        let cond = &after_kw[1..paren_end];
        let rest = &after_kw[paren_end + 2..].trim();
        Some((cond, rest))
    }

    // Handle while loop: "while (cond) body; remaining" → "while (cond) { body; }"
    if trimmed.starts_with("while ") {
        let (cond, rest) = parse_cond_and_rest(trimmed, 6).unwrap();

        // Check if there's a semicolon separating the loop body from what follows.
        let (body_stmts, body_result) = if let Some(semi_pos) = find_top_level_semicolon(rest) {
            compile_expression(&rest[..semi_pos], ctx)?
        } else {
            compile_expression(rest, ctx)?
        };

        let (_, cond_result) = compile_expression(cond, ctx)?;
        let c_stmt = build_c_block("while", &cond_result, &body_stmts, &body_result);

        // If there's content after the while loop (e.g., "; x"), use it as return.
        if let Some(semi_pos) = find_top_level_semicolon(rest) {
            let after_while = rest[semi_pos + 1..].trim();
            if !after_while.is_empty() {
                let (_, after_result) = compile_expression(after_while, ctx)?;
                return Ok((c_stmt, after_result));
            }
        }

        return Ok((c_stmt, String::new()));
    }

    // Handle for-in-range loop: "for (i in start..end) body; remaining"
    if trimmed.starts_with("for ") {
        let paren_start = 4; // skip "for "
        let paren_end = find_matching_paren(&trimmed[paren_start..]).unwrap();
        let for_header = &trimmed[paren_start + 1..paren_start + paren_end];
        let rest = &trimmed[paren_start + paren_end + 2..].trim();

        // Parse "i in start..end"
        let in_parts: Vec<&str> = for_header.splitn(2, "in ").collect();
        if in_parts.len() == 2 {
            let var_name = in_parts[0].trim();
            let range_str = in_parts[1].trim();

            // Parse start..end (compile both bounds)
            let dotdot_pos = range_str.find("..").unwrap();
            let start_expr = &range_str[..dotdot_pos];
            let end_expr = &range_str[dotdot_pos + 2..];

            let (_, start_result) = compile_expression(start_expr, ctx)?;
            let (_, end_result) = compile_expression(end_expr, ctx)?;

            // Compile loop body — split on semicolon if there's a trailing expression.
            let (body_stmts, body_result) = if let Some(semi_pos) = find_top_level_semicolon(rest) {
                compile_expression(&rest[..semi_pos], ctx)?
            } else {
                compile_expression(rest, ctx)?
            };

            // Generate C for loop: "for (int i = start; i < end; i++) { body; }"
            let header = format!(
                "for (int {} = {}; {} < {}; {}++)",
                var_name, start_result, var_name, end_result, var_name
            );
            let c_stmt = build_c_block_with_header(&header, &body_stmts, &body_result);

            // If there's content after the for loop (e.g., "; sum"), use it as return.
            if let Some(semi_pos) = find_top_level_semicolon(rest) {
                let after_for = rest[semi_pos + 1..].trim();
                if !after_for.is_empty() {
                    let (_, after_result) = compile_expression(after_for, ctx)?;
                    return Ok((c_stmt, after_result));
                }
            }

            return Ok((c_stmt, String::new()));
        } else {
            // Fallback for unexpected syntax — treat as error.
            return Err(format!("Invalid for loop syntax: {}", for_header));
        }
    }

    // Handle function definition: "fn name(params) => body; remaining"
    // Also handles generic functions: "fn name<T>(params) => body; remaining"
    if trimmed.starts_with("fn ") {
        let after_fn = &trimmed[3..];
        // Find the opening paren to get function name (may include generic params like "name<T>")
        let paren_pos = after_fn
            .find('(')
            .ok_or_else(|| format!("Invalid fn syntax: {}", after_fn))?;
        let func_name_raw = after_fn[..paren_pos].trim();

        // Parse generic type parameters if present: "name<T, U>" -> name="name", params=["T","U"]
        let (func_name, type_params) =
            parse_generic_params(func_name_raw).map_err(|e| format!("Invalid fn syntax: {}", e))?;

        // Parse parameters inside parens
        let params_str_start = paren_pos + 1;
        let params_paren_end = find_matching_paren(&after_fn[params_str_start - 1..])
            .ok_or_else(|| format!("Invalid fn syntax: missing closing paren"))?;
        let params_inner =
            &after_fn[params_str_start..params_str_start + params_paren_end - 1].trim();

        // Parse each parameter: "name : Type" or just "name"
        let mut param_names: Vec<String> = Vec::new();
        if !params_inner.is_empty() {
            for param in params_inner.split(',') {
                let parts: Vec<&str> = param.trim().split(':').collect();
                let name = parts[0].trim();
                if !name.is_empty() {
                    param_names.push(name.to_string());
                }
            }
        }

        // Find optional return type annotation and "=>" after the params
        let after_params = &after_fn[params_str_start + params_paren_end..];

        // Check for ": ReturnType =>" or just "=>"
        if !after_params.contains("=>") {
            return Err(format!(
                "Invalid fn syntax: expected '=>' but got '{}'",
                after_params
            ));
        }
        let arrow_pos = after_params.find("=>").unwrap();
        let body_and_rest = &after_params[arrow_pos + 2..].trim(); // skip "=>"

        // Find semicolon separating function definition from remaining code
        if let Some(semi_pos) = find_top_level_semicolon(body_and_rest) {
            let func_body = &body_and_rest[..semi_pos];
            let remaining = &body_and_rest[semi_pos + 1..].trim();

            // If this is a generic function, store the template for later monomorphization
            if !type_params.is_empty() {
                ctx.generic_functions.push(GenericFunctionTemplate {
                    name: func_name.clone(),
                    type_params,
                    param_names,
                    body: func_body.to_string(),
                });
                // Register the base name so we can find it during calls
                ctx.generated_functions
                    .push((func_name, Vec::new(), String::new()));

                // Compile remaining expression after the function definition
                if !remaining.is_empty() {
                    return compile_expression(remaining, ctx);
                }

                return Ok((String::new(), String::new()));
            }

            // Non-generic function: generate C code immediately
            let fn_read_entries = find_reads_in_order(func_body);
            let mut fn_ctx = CompileContext::new(
                (0..fn_read_entries.len())
                    .map(|i| format!("v{}", i))
                    .collect(),
            );

            for name in &param_names {
                fn_ctx.declared_vars.insert(name.clone());
            }

            let (fn_body_stmts, fn_return_expr) = compile_expression(func_body, &mut fn_ctx)?;

            let c_func = build_c_function(
                &func_name,
                &param_names,
                &fn_read_entries,
                &fn_body_stmts,
                &fn_return_expr,
            );
            ctx.generated_functions
                .push((func_name, param_names, c_func));

            // Compile remaining expression after the function definition
            if !remaining.is_empty() {
                return compile_expression(remaining, ctx);
            }

            return Ok((String::new(), String::new()));
        } else {
            return Err(format!("Invalid fn syntax: missing semicolon after body"));
        }
    }

    // Handle type alias: "type Name = Type; rest"
    if trimmed.starts_with("type ") {
        let after_type = &trimmed[5..]; // skip "type "
        if let Some(semi_pos) = find_top_level_semicolon(after_type) {
            let alias_part = &after_type[..semi_pos];
            let rest = &after_type[semi_pos + 1..].trim();
            // Parse "Name = Type"
            if let Some(eq_pos) = find_top_level_char(alias_part, '=') {
                let alias_name = alias_part[..eq_pos].trim();
                let alias_type_str = alias_part[eq_pos + 1..].trim();
                // Parse union types: "I32 | Bool" -> ["I32", "Bool"]
                let member_types: Vec<String> = alias_type_str
                    .split('|')
                    .map(|s| s.trim().to_string())
                    .collect();
                ctx.type_aliases
                    .insert(alias_name.to_string(), member_types.clone());
                // Track union types where members are structs (for tagged union generation)
                let struct_members: Vec<String> = member_types
                    .into_iter()
                    .filter(|t| ctx.defined_structs.contains(t.as_str()))
                    .collect();
                if !struct_members.is_empty() {
                    ctx.union_types
                        .insert(alias_name.to_string(), struct_members);
                }
            }
            if !rest.is_empty() {
                return compile_expression(rest, ctx);
            }
            return Ok((String::new(), String::from("0")));
        }
    }

    // Handle struct definition: "struct Name { fields }" or "struct Name<T> { fields }"
    if trimmed.starts_with("struct ") {
        let after_struct = &trimmed[7..]; // skip "struct " (7 chars)

        // Find opening brace to get struct name (may include generic params like "Name<T>")
        let brace_pos = after_struct
            .find('{')
            .ok_or_else(|| format!("Invalid struct syntax: {}", after_struct))?;
        let struct_name_raw = after_struct[..brace_pos].trim();

        // Parse generic type parameters if present: "Name<T, U>" -> name="Name", params=["T","U"]
        let (struct_name, type_params) = parse_generic_params(struct_name_raw)
            .map_err(|e| format!("Invalid struct syntax: {}", e))?;

        // Find matching closing brace
        let brace_end = find_matching_brace(&after_struct[brace_pos..])
            .ok_or_else(|| format!("Invalid struct syntax: missing closing brace"))?;
        let fields_str = &after_struct[brace_pos + 1..brace_pos + brace_end].trim();

        // Check for duplicate struct definition
        if !type_params.is_empty() {
            // Generic struct - store template for later monomorphization
            if ctx.defined_structs.contains(&struct_name) {
                return Err(format!("Duplicate struct definition: {}", struct_name));
            }
            ctx.defined_structs.insert(struct_name.clone());
            ctx.generic_structs.push(GenericStructTemplate {
                name: struct_name.clone(),
                type_params,
                fields_str: fields_str.to_string(),
            });
        } else {
            // Non-generic struct - generate C typedef immediately
            // Parse fields (comma-separated, each can be "name : Type")
            let mut c_fields = String::new();
            let mut seen_fields: HashSet<String> = HashSet::new();
            if !fields_str.is_empty() {
                for field in fields_str.split(',') {
                    let parts: Vec<&str> = field.trim().split(':').collect();
                    let name = parts[0].trim().to_string();
                    // Check for duplicate field names
                    if !seen_fields.insert(name.clone()) {
                        return Err(format!("Duplicate struct field: {}", name));
                    }
                    // Determine field type from annotation (type is required)
                    let field_type_str: String = if parts.len() > 1 {
                        let ty = parts[1].trim();
                        // Validate type is known
                        if !is_valid_type(ctx, ty) {
                            return Err(format!("Unknown type: {}", ty));
                        }
                        // Handle generic struct instantiations: "Wrapper<I32>" -> "Wrapper_I32"
                        if let Some((base, type_args_str)) = parse_generic_type(ty) {
                            let type_args: Vec<&str> = type_args_str.split(',').map(|a| a.trim()).collect();
                            monomorphize_generic_struct(ctx, base, &type_args)?
                        } else {
                            tuff_type_to_c(ctx, ty)?
                        }
                    } else {
                        return Err(format!("Missing type annotation for struct field '{}'", name));
                    };
                    c_fields.push_str(&format!("\t\t{} {};\n", field_type_str, name));
                }
            }

            // Generate C typedef struct (C requires 'struct' keyword before braces)
            let mut typedef = "typedef struct {\n".to_string();
            if !fields_str.is_empty() {
                typedef.push_str(&c_fields);
            }
            typedef.push_str("} ");
            typedef.push_str(&struct_name);
            typedef.push(';');

            if !ctx.defined_structs.insert(struct_name.clone()) {
                return Err(format!("Duplicate struct definition: {}", struct_name));
            }

            ctx.generated_structs.push(typedef);
        }

        // Check for remaining content after the struct definition (semicolon-separated)
        let rest = &after_struct[brace_pos + brace_end + 1..].trim();
        // Strip trailing semicolons only when followed by another struct definition
        let rest = if rest.starts_with("struct ") {
            rest.trim_end_matches(';').trim()
        } else {
            rest
        };
        if !rest.is_empty() {
            eprintln!("[struct] rest: '{}'", rest);
            return compile_expression(rest, ctx);
        }

        return Ok((String::new(), String::from("0")));
    }

    // Handle if/else expression: "if (cond) a else b" → "(cond ? a : b)" or block form for statements.
    // Or statement form: "if (cond) stmt;" → "if (cond) { stmt; }"
    if trimmed.starts_with("if ") {
        let (cond, rest) = parse_cond_and_rest(trimmed, 3).unwrap();

        // Find "else" keyword (not inside parens)
        if let Some(else_pos) = find_top_level_else(rest) {
            let then_expr = &rest[..else_pos].trim();
            let else_expr = &rest[else_pos + "else".len()..].trim();

            // Check if either branch is a statement (contains assignment at top level or inside braces).
            fn has_assignment_in(s: &str) -> bool {
                find_top_level_char(s, '=').is_some() || {
                    let trimmed = s.trim();
                    // Also check inside brace-delimited blocks.
                    if trimmed.starts_with('{') && trimmed.ends_with('}') && trimmed.len() >= 2 {
                        let inner = &trimmed[1..trimmed.len() - 1];
                        find_top_level_char(inner, '=').is_some()
                    } else {
                        false
                    }
                }
            }
            let then_is_stmt = has_assignment_in(then_expr);
            let else_is_stmt = has_assignment_in(else_expr);

            let (_, cond_result) = compile_expression(cond, ctx)?;

            if then_is_stmt || else_is_stmt {
                // Generate C if/else block form for statements.
                let (then_body, then_result) = compile_expression(then_expr, ctx)?;

                // Check if else branch has a trailing semicolon with content after it.
                // Also check for brace-delimited blocks followed by content: "{ x = read(); } x"
                let mut else_part: &str = else_expr;
                let after_else: &str = if let Some(semi_pos) = find_top_level_semicolon(else_expr) {
                    else_part = &else_expr[..semi_pos];
                    &else_expr[semi_pos + 1..]
                } else {
                    // Check for brace-delimited block followed by content.
                    let trimmed_else = else_expr.trim();
                    if let Some(block_len) = find_matching_brace(trimmed_else) {
                        // Content after the closing brace (block_len is index of '}').
                        let after_block = &trimmed_else[block_len + 1..].trim();
                        if !after_block.is_empty() {
                            else_part = &trimmed_else[..=block_len]; // Include the closing brace.
                            after_block
                        } else {
                            ""
                        }
                    } else {
                        ""
                    }
                };

                let (else_body, else_result) = compile_expression(else_part.trim(), ctx)?;

                // Build if/else block with bodies inside.
                let mut c_stmt = String::new();
                c_stmt.push_str(&format!("\tif ({}) {{\n", cond_result));
                if !then_body.is_empty() {
                    for line in then_body.lines() {
                        c_stmt.push('\t');
                        c_stmt.push_str(line);
                        c_stmt.push('\n');
                    }
                }
                // Only add result line if there's a non-empty result (avoid empty semicolons).
                if !then_result.is_empty() {
                    c_stmt.push_str(&format!("\t\t{};\n", then_result));
                }
                c_stmt.push_str("\t} else {\n");
                if !else_body.is_empty() {
                    for line in else_body.lines() {
                        c_stmt.push('\t');
                        c_stmt.push_str(line);
                        c_stmt.push('\n');
                    }
                }
                // Only add result line if there's a non-empty result.
                if !else_result.is_empty() {
                    c_stmt.push_str(&format!("\t\t{};\n", else_result));
                }
                c_stmt.push_str("\t}");

                // If there's content after the else branch (e.g., "; x"), use it as return.
                let ret = if !after_else.trim().is_empty() {
                    compile_expression(after_else.trim(), ctx).map(|r| r.1)?
                } else {
                    String::new()
                };

                return Ok((c_stmt, ret));
            } else {
                // Pure expressions — use ternary.
                let (_, then_result) = compile_expression(then_expr, ctx)?;
                let (_, else_result) = compile_expression(else_expr, ctx)?;

                return Ok((
                    String::new(),
                    format!("({} ? {} : {})", cond_result, then_result, else_result),
                ));
            }
        } else {
            // No else — treat as statement: "if (cond) body" or "if (cond) body; remaining..."
            let (_, cond_result) = compile_expression(cond, ctx)?;

            // Check if rest has a top-level semicolon separating then-body from what follows
            if let Some(semi_pos) = find_top_level_semicolon(rest) {
                let then_part = &rest[..semi_pos].trim();
                let after_part = &rest[semi_pos + 1..].trim();

                let (then_body, then_result) = compile_expression(then_part, ctx)?;
                let c_stmt = format!(
                    "{}\n\tif ({}) {{\n\t\t{};\n\t}}",
                    then_body, cond_result, then_result
                );

                if !after_part.is_empty() {
                    let (_, after_result) = compile_expression(after_part, ctx)?;
                    return Ok((c_stmt, after_result));
                } else {
                    return Ok((c_stmt, String::new()));
                }
            } else {
                // No semicolon — entire rest is the then-body
                let (then_body, then_result) = compile_expression(rest, ctx)?;
                let c_stmt = format!(
                    "{}\n\tif ({}) {{\n\t\t{};\n\t}}",
                    then_body, cond_result, then_result
                );
                return Ok((c_stmt, String::new()));
            }
        }
    }

    // Check for struct instantiation: "StructName {}" or "StructName { field1, field2 }"
    // Also handles generic instantiation: "StructName<T> { field1, field2 }"
    // Must be checked BEFORE read replacement so field values are compiled correctly.
    if let Some(brace_pos) = trimmed.find('{') {
        let before_brace = &trimmed[..brace_pos].trim();
        // Parse generic type args if present: "Wrapper<I32>" -> ("Wrapper", ["I32"])
        let (struct_base, type_args) = if let Some(angle_start) = before_brace.find('<') {
            if let Some(angle_end) = before_brace.find('>') {
                let base = before_brace[..angle_start].trim().to_string();
                let args: Vec<String> = before_brace[angle_start + 1..angle_end]
                    .split(',')
                    .map(|a| a.trim().to_string())
                    .collect();
                (base, args)
            } else {
                (before_brace.to_string(), Vec::new())
            }
        } else {
            (before_brace.to_string(), Vec::new())
        };

        // Must be a single identifier (no spaces)
        if !struct_base.contains(' ') {
            // Check if this is a generic struct instantiation
            let concrete_name = if type_args.is_empty() {
                struct_base.clone()
            } else {
                format!("{}_{}", struct_base, type_args.join("_"))
            };

            // Monomorphize generic struct if needed
            if !type_args.is_empty() {
                let type_args_refs: Vec<&str> = type_args.iter().map(|s| s.as_str()).collect();
                monomorphize_generic_struct(ctx, &struct_base, &type_args_refs)?;
            }

            // Check if struct is defined (either non-generic or already monomorphized)
            if ctx.defined_structs.contains(&concrete_name) {
                // Find matching closing brace
                if let Some(block_len) = find_matching_brace(&trimmed[brace_pos..]) {
                    let fields_str = &trimmed[brace_pos + 1..brace_pos + block_len].trim();
                    // Parse and compile each field initializer
                    let mut c_body = String::new();
                    let mut compiled_fields = Vec::new();
                    if !fields_str.is_empty() {
                        for field in fields_str.split(',') {
                            let field = field.trim();
                            if let Some(colon_pos) = field.find(':') {
                                let field_name = field[..colon_pos].trim();
                                let field_value = field[colon_pos + 1..].trim();
                                let (field_body, field_result) =
                                    compile_expression(field_value, ctx)?;
                                c_body.push_str(&field_body);
                                compiled_fields.push(format!(".{} = {}", field_name, field_result));
                            }
                        }
                    }
                    let c_init = format!("({}){{{} }}", concrete_name, compiled_fields.join(", "));
                    return Ok((c_body, c_init));
                }
            }
        }
    }

    // Handle logical operators "&&" and "||" at top level
    for op in &[" && ", " || "] {
        if let Some(pos) = find_top_level_keyword(trimmed, op) {
            let lhs = trimmed[..pos].trim().to_string();
            let rhs = trimmed[pos + op.len()..].trim().to_string();
            let (_, lhs_result) = compile_expression(&lhs, ctx)?;
            let (_, rhs_result) = compile_expression(&rhs, ctx)?;
            return Ok((
                String::new(),
                format!("({}) {} ({})", lhs_result, op.trim(), rhs_result),
            ));
        }
    }

    // Handle "is" type-checking operator: "expr is Type" => 1 if types match, 0 otherwise
    if let Some(is_pos) = find_top_level_keyword(trimmed, " is ") {
        let lhs = trimmed[..is_pos].trim().to_string();
        let check_type = trimmed[is_pos + 4..].trim().to_string(); // skip " is "
        // Compile LHS to get its expression
        let (_, _lhs_result) = compile_expression(&lhs, ctx)?;
        // Check if this is a tagged union variable - generate runtime tag check
        let is_union_check = if ctx.tagged_union_vars.contains(&lhs) {
            // Find the union type for this variable
            if let Some(var_types) = ctx.var_types.get(&lhs) {
                for (_union_alias, struct_members) in &ctx.union_types {
                    // Check if var_types are from this union
                    let match_count = var_types
                        .iter()
                        .filter(|vt| struct_members.iter().any(|sm| *sm == **vt))
                        .count();
                    if match_count > 0 && struct_members.iter().any(|m| m == &check_type) {
                        // Generate runtime tag check: (lhs.tag == Tag_checkType)
                        return Ok((
                            String::new(),
                            format!("({}.tag == Tag_{})", lhs, check_type),
                        ));
                    }
                }
            }
            false
        } else {
            false
        };
        if is_union_check {
            // Already returned above
        }
        // Determine the set of possible types for the LHS expression (compile-time check)
        let lhs_types: Vec<String> = if let Some(var_types) = ctx.var_types.get(&lhs) {
            // Resolve each type through aliases
            let mut resolved = Vec::new();
            for ty in var_types {
                resolved.extend(resolve_type_alias_set(ctx, ty));
            }
            resolved
        } else {
            vec![infer_literal_type(&lhs)]
        };
        // Resolve check type through aliases
        let check_types = resolve_type_alias_set(ctx, &check_type);
        // Check if any LHS type matches any check type
        let matched = lhs_types
            .iter()
            .any(|lt| check_types.iter().any(|ct| lt == ct));
        let result = if matched { "1" } else { "0" };
        return Ok((String::new(), String::from(result)));
    }

    // Handle string property access: "expr.length" => "strlen(expr)" for &Str types
    if let Some(dot_pos) = find_top_level_dot_length(trimmed) {
        let base_expr = trimmed[..dot_pos].trim();
        // Check if the base expression is a variable of type &Str
        let base_var = base_expr.trim();
        if let Some(types) = ctx.var_types.get(base_var) {
            if types.iter().any(|t| t == "&Str") {
                let (_, base_result) = compile_expression(base_expr, ctx)?;
                return Ok((String::new(), format!("(int)strlen({})", base_result)));
            }
        }
        // Fallback: treat as struct field access (pass through)
        let (_, base_result) = compile_expression(base_expr, ctx)?;
        return Ok((String::new(), format!("{}.length", base_result)));
    }

    // Handle "!" (not) operator: "!expr" => "!expr"
    if trimmed.starts_with('!') {
        let (_, inner_result) = compile_expression(&trimmed[1..], ctx)?;
        return Ok((String::new(), format!("(!{})", inner_result)));
    }

    // Base case: replace read<T>() and read() with variables, convert braces to parens.
    let mut result = String::new();

    /// Validate that a U8 literal value is within range (0-255).
    fn validate_u8_range(before: &str) -> Result<(), CompileError> {
        let num_str = before.trim_end_matches(|c: char| !c.is_ascii_digit());
        // Check for negative values (U8 cannot be negative)
        if num_str.starts_with('-') {
            if let Ok(val) = num_str.parse::<i64>() {
                return Err(format!("U8 literal out of range: {} (must be 0-255)", val));
            }
        }
        if let Ok(val) = num_str.parse::<u64>() {
            if val > 255 {
                return Err(format!("U8 literal out of range: {} (must be 0-255)", val));
            }
        }
        Ok(())
    }

    fn copy_chars(s: &str, out: &mut String) {
        for ch in s.chars() {
            match ch {
                '{' => out.push('('),
                '}' => out.push(')'),
                _ => out.push(ch),
            }
        }
    }

    // First pass: handle generic reads like read<Bool>(), etc.
    let mut last = 0;
    for m in trimmed.match_indices("read<") {
        copy_chars(&trimmed[last..m.0], &mut result);
        let rest = &trimmed[m.0 + m.1.len()..]; // after "read<"
        if let Some(end_pos) = rest.find(">()") {
            result.push_str(&ctx.vars[ctx.var_idx]);
            ctx.var_idx += 1;
            last = m.0 + m.1.len() + end_pos + ">()".len();
        } else {
            // Fallback: copy literally (shouldn't happen with valid input)
            for ch in trimmed[m.0..].chars() {
                result.push(ch);
            }
            last = trimmed.len();
        }
    }

    // Second pass: handle plain read() calls on remaining text after generics.
    let remaining_start = last;
    let remaining = &trimmed[remaining_start..];
    for (i, m) in remaining.match_indices("read()").enumerate() {
        if i == 0 && m.0 == 0 {
            copy_chars(&remaining[..m.0], &mut result);
        } else {
            // Copy text between previous match end and this one
            let prev_end = last;
            copy_chars(&trimmed[prev_end..remaining_start + m.0], &mut result);
        }
        result.push_str(&ctx.vars[ctx.var_idx]);
        ctx.var_idx += 1;
        last = remaining_start + m.0 + "read()".len();
    }
    // Copy any trailing text after last read().
    copy_chars(&trimmed[last..], &mut result);

    // Strip literal suffixes from integer literals (C doesn't support U8 or I64 suffixes)
    let u8_validate = |before: &str| validate_u8_range(before);
    result = strip_literal_suffix(&result, "U8", Some(&u8_validate))?;
    result = strip_literal_suffix(&result, "I64", None)?;

    // Third pass: handle function calls (generic & non-generic) inline in the result
    // This replaces function calls in-place so surrounding expressions (e.g., "+ 1") are preserved
    let final_result = result;
    let mut func_result = String::new();
    let mut func_last = 0;

    // Find function calls in the result (after read replacement)
    for m in final_result.match_indices('(') {
        let before_paren = &final_result[..m.0];
        // Find the function name (go backwards from '(')
        let name_end = m.0;
        let mut name_start = name_end;
        let mut in_angle = 0;
        let mut chars = before_paren.char_indices().rev();
        for (_, ch) in chars.by_ref() {
            if ch == '>' {
                in_angle += 1;
                name_start -= ch.len_utf8();
            } else if ch == '<' {
                if in_angle > 0 {
                    in_angle -= 1;
                } else {
                    break;
                }
                name_start -= ch.len_utf8();
            } else if ch.is_alphanumeric() || ch == '_' {
                name_start -= ch.len_utf8();
            } else {
                break;
            }
        }

        let potential_name = &final_result[name_start..name_end];
        // Parse generic type args if present
        let (call_name, call_type_args) = if let Some(angle_start) = potential_name.find('<') {
            if let Some(angle_end) = potential_name.find('>') {
                let base = potential_name[..angle_start].trim().to_string();
                let args: Vec<String> = potential_name[angle_start + 1..angle_end]
                    .split(',')
                    .map(|a| a.trim().to_string())
                    .collect();
                (base, args)
            } else {
                (potential_name.to_string(), Vec::new())
            }
        } else {
            (potential_name.to_string(), Vec::new())
        };

        // Skip if this looks like a comparison operator (e.g., "x < y")
        if name_start > 0 {
            let char_before = final_result[..name_start].chars().next_back();
            if let Some(ch) = char_before {
                if ch.is_alphanumeric() || ch == ')' || ch == ']' {
                    // Continue processing
                } else {
                    continue;
                }
            }
        }

        // Resolve the concrete function name to use (generic or non-generic)
        let resolved_name = if !call_type_args.is_empty() {
            if let Some(template) = ctx.generic_functions.iter().find(|t| t.name == call_name) {
                let concrete_name = format!("{}_{}", call_name, call_type_args.join("_"));
                if !ctx
                    .generated_function_instantiations
                    .contains(&concrete_name)
                {
                    let fn_read_entries = find_reads_in_order(&template.body);
                    let mut fn_ctx = CompileContext::new(
                        (0..fn_read_entries.len())
                            .map(|i| format!("v{}", i))
                            .collect(),
                    );
                    for name in &template.param_names {
                        fn_ctx.declared_vars.insert(name.clone());
                    }
                    let (fn_body_stmts, fn_return_expr) =
                        compile_expression(&template.body, &mut fn_ctx)?;
                    let c_func = build_c_function(
                        &concrete_name,
                        &template.param_names,
                        &fn_read_entries,
                        &fn_body_stmts,
                        &fn_return_expr,
                    );
                    ctx.generated_functions.push((
                        concrete_name.clone(),
                        template.param_names.clone(),
                        c_func,
                    ));
                    ctx.generated_function_instantiations
                        .insert(concrete_name.clone());
                }
                Some(concrete_name)
            } else {
                None // Built-in generic like read<Bool> - skip
            }
        } else if !call_name.contains(|c: char| c == ' ')
            && ctx
                .generated_functions
                .iter()
                .any(|(name, _, _)| *name == call_name)
        {
            Some(call_name.clone())
        } else {
            None
        };

        // Replace function call in result if we resolved a name
        if let Some(resolved_name) = resolved_name {
            if let Some(paren_end) = find_matching_paren(&final_result[m.0..]) {
                let abs_paren_end = m.0 + paren_end;
                let args_str = &final_result[m.0 + 1..abs_paren_end].trim();
                let call_expr = compile_fn_call(&resolved_name, args_str, ctx)?;
                copy_chars(&final_result[func_last..name_start], &mut func_result);
                func_result.push_str(&call_expr);
                func_last = abs_paren_end + 1;
            }
        }
    }

    // Copy remaining text after last function call
    copy_chars(&final_result[func_last..], &mut func_result);

    Ok((String::new(), func_result))
}

/// Find the index of the matching closing brace for an opening brace at position 0.
fn find_matching_brace(s: &str) -> Option<usize> {
    if !s.starts_with('{') {
        return None;
    }
    let mut depth = 0;
    for (i, ch) in s.chars().enumerate() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

/// Infer the type of a literal expression based on its suffix.
/// "100I64" -> "I64", "100U8" -> "U8", "\"hello\"" -> "&Str", "100" -> "I32"
fn infer_literal_type(expr: &str) -> String {
    let trimmed = expr.trim();
    // String literal: "..." -> &Str
    if trimmed.starts_with('"') && trimmed.ends_with('"') {
        return "&Str".to_string();
    }
    if trimmed.ends_with("I64") {
        // Verify the char before "I64" is a digit (not part of an identifier)
        if let Some(before_suffix) = trimmed.strip_suffix("I64") {
            if let Some(last_ch) = before_suffix.chars().last() {
                if last_ch.is_ascii_digit() {
                    return "I64".to_string();
                }
            }
        }
    }
    if trimmed.ends_with("U8") {
        if let Some(before_suffix) = trimmed.strip_suffix("U8") {
            if let Some(last_ch) = before_suffix.chars().last() {
                if last_ch.is_ascii_digit() {
                    return "U8".to_string();
                }
            }
        }
    }
    "I32".to_string()
}

/// Check if a type name is a known built-in type or a defined struct/alias.
/// Handles generic types like `Wrapper<I32>` by extracting the base name.
fn is_valid_type(ctx: &CompileContext, ty: &str) -> bool {
    matches!(ty, "I32" | "I64" | "U8" | "&Str" | "Bool")
        || ctx.defined_structs.contains(ty)
        || ctx.type_aliases.contains_key(ty)
        || ctx.union_types.contains_key(ty)
        || {
            // Handle generic types like "Wrapper<I32>" — extract base name
            if let Some(angle_start) = ty.find('<') {
                let base = &ty[..angle_start];
                ctx.defined_structs.contains(base)
            } else {
                false
            }
        }
}

/// Map a Tuff type name to its corresponding C type.
/// Returns an error for unknown types instead of defaulting to "int".
fn tuff_type_to_c(ctx: &CompileContext, ty: &str) -> Result<String, CompileError> {
    // Built-in types
    match ty {
        "I32" => return Ok("int".to_string()),
        "I64" => return Ok("long long".to_string()),
        "U8" => return Ok("unsigned char".to_string()),
        "&Str" => return Ok("const char *".to_string()),
        "Bool" => return Ok("int".to_string()),
        _ => {}
    }
    // User-defined struct (typedef name used as-is)
    if ctx.defined_structs.contains(ty) {
        return Ok(ty.to_string());
    }
    // Type alias — resolve and recurse
    if let Some(members) = ctx.type_aliases.get(ty) {
        if members.len() == 1 {
            return tuff_type_to_c(ctx, &members[0]);
        }
        // Union alias — return first member's C type (or error if empty)
        if let Some(first) = members.first() {
            return tuff_type_to_c(ctx, first);
        }
    }
    // Union type — resolve to underlying types
    if let Some(variants) = ctx.union_types.get(ty) {
        if let Some(first) = variants.first() {
            return tuff_type_to_c(ctx, first);
        }
    }
    // Generic struct instantiation: "Wrapper<I32>" -> build concrete C name
    if let Some((base, type_args_str)) = parse_generic_type(ty) {
        let type_args: Vec<&str> = type_args_str.split(',').map(|a| a.trim()).collect();
        let sanitized_args: Vec<String> = type_args.iter().map(|a| sanitize_type_name(a)).collect();
        let args_joined = sanitized_args.join("_");
        return Ok(format!("{}_{}", base, args_joined));
    }
    Err(format!("Unknown type: {}", ty))
}

/// Resolve a type name, following type aliases to their underlying type(s).
/// Returns a list of resolved types (for union aliases, returns all members).
fn resolve_type_alias_set(ctx: &CompileContext, type_name: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut stack = vec![type_name.to_string()];
    let mut visited = std::collections::HashSet::new();
    while let Some(current) = stack.pop() {
        if !visited.insert(current.clone()) {
            continue;
        }
        if let Some(members) = ctx.type_aliases.get(&current) {
            for member in members {
                stack.push(member.clone());
            }
        } else {
            result.push(current);
        }
    }
    result
}

/// Resolve a single type name to a single resolved type (non-union).
fn resolve_type_alias(ctx: &CompileContext, type_name: &str) -> String {
    let resolved = resolve_type_alias_set(ctx, type_name);
    resolved
        .into_iter()
        .next()
        .unwrap_or_else(|| type_name.to_string())
}

/// Strip a literal suffix from text if it follows a digit and is not part of an identifier.
/// Optionally validates the numeric value before stripping.
fn strip_literal_suffix(
    text: &str,
    suffix: &str,
    validate: Option<&dyn Fn(&str) -> Result<(), CompileError>>,
) -> Result<String, CompileError> {
    let mut stripped = String::new();
    let mut skip_until = 0;
    let suffix_len = suffix.len();
    for (i, m) in text.match_indices(suffix).enumerate() {
        let start = if i == 0 { 0 } else { skip_until };
        if m.0 > start {
            stripped.push_str(&text[start..m.0]);
        }
        let before = &text[..m.0];
        if let Some(last_ch) = before.chars().last() {
            if last_ch.is_ascii_digit() {
                let after = &text[m.0 + suffix_len..];
                if let Some(next_ch) = after.chars().next() {
                    if !next_ch.is_alphanumeric() && next_ch != '_' {
                        if let Some(v) = validate {
                            v(before)?;
                        }
                        skip_until = m.0 + suffix_len;
                        continue;
                    }
                } else {
                    if let Some(v) = validate {
                        v(before)?;
                    }
                    skip_until = m.0 + suffix_len;
                    continue;
                }
            }
        }
        stripped.push_str(suffix);
        skip_until = m.0 + suffix_len;
    }
    if skip_until < text.len() {
        stripped.push_str(&text[skip_until..]);
    }
    Ok(stripped)
}

/// Find the index of the matching closing bracket for an opening bracket at position 0.
fn find_matching_bracket(s: &str) -> Option<usize> {
    if !s.starts_with('[') {
        return None;
    }
    let mut depth = 0;
    for (i, ch) in s.chars().enumerate() {
        match ch {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

/// Find the index of a top-level semicolon (not inside any braces or brackets).
fn find_top_level_semicolon(s: &str) -> Option<usize> {
    find_top_level_char(s, ';')
}

/// Find matching closing paren for opening paren at position 0.
/// Skips content inside angle brackets used as type parameters (e.g., read<Bool>()),
/// but treats standalone < and > as regular characters (comparison operators).
fn find_matching_paren(s: &str) -> Option<usize> {
    if !s.starts_with('(') {
        return None;
    }
    let mut depth = 0;
    let mut angle_depth = 0; // tracks nested <...> for type parameters
    let chars: Vec<char> = s.chars().collect();
    for (i, ch) in chars.iter().enumerate() {
        match *ch {
            '<' if i > 0 && chars[i - 1].is_alphanumeric() => angle_depth += 1,
            '>' if angle_depth > 0 => angle_depth -= 1,
            '(' if angle_depth == 0 => depth += 1,
            ')' if angle_depth == 0 => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

/// Sanitize a type name for use in a C identifier (e.g. "&Str" -> "Str").
fn sanitize_type_name(ty: &str) -> String {
    ty.replace('&', "").replace(' ', "_")
}

/// Build a concrete type name from a base and type args string.
/// "Wrapper", "I32" -> "Wrapper_I32"
/// "Wrapper", "I32, Bool" -> "Wrapper_I32_Bool"
/// "Wrapper", "&Str" -> "Wrapper_Str"
fn build_concrete_name(base: &str, type_args_str: &str) -> String {
    let type_args: Vec<String> = type_args_str.split(',').map(|a| sanitize_type_name(a.trim())).collect();
    format!("{}_{}", base, type_args.join("_"))
}

/// Parse a generic type annotation like "Wrapper<I32>" into (base, type_args_str).
/// Returns None if the type is not generic.
fn parse_generic_type(ty: &str) -> Option<(&str, &str)> {
    if let Some(angle_start) = ty.find('<') {
        if let Some(angle_end) = ty.find('>') {
            let base = &ty[..angle_start];
            let type_args_str = &ty[angle_start + 1..angle_end];
            Some((base, type_args_str))
        } else {
            None
        }
    } else {
        None
    }
}

/// Monomorphize a generic struct template into a concrete C typedef.
/// If already generated, does nothing. Returns the concrete name.
fn monomorphize_generic_struct(
    ctx: &mut CompileContext,
    base: &str,
    type_args: &[&str],
) -> Result<String, CompileError> {
    let concrete_name = format!("{}_{}", base, type_args.iter().map(|a| sanitize_type_name(a)).collect::<Vec<_>>().join("_"));
    if ctx.generated_instantiations.contains(&concrete_name) {
        return Ok(concrete_name);
    }
    let template = ctx.generic_structs.iter().find(|t| t.name == base)
        .ok_or_else(|| format!("Undefined generic struct: {}", base))?;
    let mut concrete_fields = String::new();
    let mut seen_fields: HashSet<String> = HashSet::new();
    for field in template.fields_str.split(',') {
        let field = field.trim();
        if field.is_empty() { continue; }
        if let Some(colon_pos) = field.find(':') {
            let field_name = field[..colon_pos].trim().to_string();
            if !seen_fields.insert(field_name.clone()) {
                return Err(format!("Duplicate struct field: {}", field_name));
            }
            let field_type = field[colon_pos + 1..].trim();
            let resolved_type = if let Some(idx) = template.type_params.iter().position(|p| p == field_type) {
                let arg = type_args.get(idx)
                    .ok_or_else(|| format!("Missing type argument at index {} in '{}'", idx, base))?;
                tuff_type_to_c(ctx, arg)?.to_string()
            } else if is_valid_type(ctx, field_type) {
                tuff_type_to_c(ctx, field_type)?.to_string()
            } else {
                return Err(format!("Unknown type in generic struct '{}': {}", base, field_type));
            };
            concrete_fields.push_str(&format!("\t\t{} {};\n", resolved_type, field_name));
        }
    }
    let mut typedef = "typedef struct {\n".to_string();
    if !concrete_fields.is_empty() {
        typedef.push_str(&concrete_fields);
    }
    typedef.push_str("} ");
    typedef.push_str(&concrete_name);
    typedef.push(';');
    ctx.generated_structs.push(typedef);
    ctx.generated_instantiations.insert(concrete_name.clone());
    ctx.defined_structs.insert(concrete_name.clone());
    Ok(concrete_name)
}

/// Find "else" keyword at top level (not inside parens/braces).
fn find_top_level_else(s: &str) -> Option<usize> {
    for i in 0..s.len().saturating_sub(3) {
        if s[i..].starts_with("else ") || &s[i..] == "else" {
            // Ensure it's a standalone keyword, not part of another word
            let before_ok =
                i == 0 || !matches!(s.chars().nth(i.saturating_sub(1)), Some('a'..='z'));
            if before_ok {
                return Some(i);
            }
        }
    }
    None
}

/// Find a keyword at top level (not inside parens/braces/brackets).
/// The keyword should include surrounding spaces if needed (e.g., " is ").
fn find_top_level_keyword(s: &str, keyword: &str) -> Option<usize> {
    let mut brace_depth = 0;
    let mut bracket_depth = 0;
    let mut paren_depth = 0;
    let keyword_len = keyword.len();

    // Determine how many leading spaces to skip for boundary check.
    let leading_spaces = keyword.chars().take_while(|&c| c == ' ').count();

    for i in 0..s.len().saturating_sub(keyword_len.saturating_sub(1)) {
        let ch = s.as_bytes()[i] as char;
        match ch {
            '{' => brace_depth += 1,
            '}' => brace_depth -= 1,
            '[' => bracket_depth += 1,
            ']' => bracket_depth -= 1,
            '(' => paren_depth += 1,
            ')' => paren_depth -= 1,
            _ => {}
        }

        if brace_depth == 0 && bracket_depth == 0 && paren_depth == 0 {
            if s[i..].starts_with(keyword) {
                // Check word boundary at the first non-space char of the keyword.
                let boundary_pos = i + leading_spaces;
                let before_ok = boundary_pos == 0
                    || !matches!(
                        s.chars().nth(boundary_pos.saturating_sub(1)),
                        Some('a'..='z') | Some('A'..='Z') | Some('_')
                    );
                if before_ok {
                    return Some(i);
                }
            }
        }
    }
    None
}

/// Find ".length" at the top level (not inside braces, brackets, or parens).
fn find_top_level_dot_length(s: &str) -> Option<usize> {
    let mut brace_depth = 0;
    let mut bracket_depth = 0;
    let mut paren_depth = 0;
    for (i, ch) in s.chars().enumerate() {
        match ch {
            '{' => brace_depth += 1,
            '}' => brace_depth -= 1,
            '[' => bracket_depth += 1,
            ']' => bracket_depth -= 1,
            '(' => paren_depth += 1,
            ')' => paren_depth -= 1,
            '.' if brace_depth == 0 && bracket_depth == 0 && paren_depth == 0 => {
                if s[i..].starts_with(".length") {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

/// Build a C block statement with a custom header line.
/// e.g., "for (int i = 0; i < n; i++) { body; }"
fn build_c_block_with_header(header: &str, body_stmts: &str, body_result: &str) -> String {
    let mut c_stmt = String::new();
    c_stmt.push_str(&format!("\t{} {{\n", header));
    if !body_stmts.is_empty() {
        for line in body_stmts.lines() {
            c_stmt.push('\t');
            c_stmt.push_str(line);
            c_stmt.push('\n');
        }
    }
    if !body_result.is_empty() {
        c_stmt.push_str(&format!("\t\t{};\n", body_result));
    }
    c_stmt.push_str("\t}");
    c_stmt
}

/// Build a C block statement like "while (cond) { body; }" or "if (cond) { stmt; }".
fn build_c_block(keyword: &str, cond_result: &str, body_stmts: &str, body_result: &str) -> String {
    let header = format!("{} ({})", keyword, cond_result);
    build_c_block_with_header(&header, body_stmts, body_result)
}

#[allow(dead_code)]
fn expect_valid(source: &str, std_in: &str, expected_exit_code: i32) {
    fn save_to_temp_path(generated: &str) -> String {
        let dir = std::env::temp_dir();
        let id = TEMP_COUNTER.fetch_add(1, Ordering::SeqCst);
        let path = dir.join(format!("tuff_test_{}_{}.c", std::process::id(), id));
        let mut file = std::fs::File::create(&path).expect("Failed to create temp file");
        file.write_all(generated.as_bytes())
            .expect("Failed to write temp file");
        path.to_str().unwrap().to_string()
    }

    fn compile_temp_path_using_clang(temp_path: &str) -> String {
        let exe_path = temp_path.replace(".c", ".exe");
        // Ensure the .c file exists and has content before compiling
        if std::fs::read_to_string(temp_path).is_err()
            || std::fs::metadata(temp_path).unwrap().len() == 0
        {
            panic!("Temp C source file is empty or missing: {}", temp_path);
        }

        let output = Command::new("clang")
            .args([temp_path, "-o", &exe_path])
            .output();

        match output {
            Ok(result) if result.status.success() => exe_path.to_string(),
            _ => {
                // Extract stderr before the temporary is dropped
                let stderr_bytes = match &output {
                    Ok(r) => r.stderr.clone(),
                    Err(e) => panic!("Failed to run clang: {}", e),
                };
                let stderr = String::from_utf8_lossy(&stderr_bytes);
                panic!("clang compilation failed:\n{}", stderr);
            }
        }
    }

    fn execute_temp_exe(temp_exe: &str, stdin: &str) -> i32 {
        let mut child = Command::new(temp_exe)
            .stdin(std::process::Stdio::piped())
            .spawn()
            .expect("Failed to start compiled exe");
        // Write stdin if provided
        if !stdin.is_empty() {
            if let Some(ref mut stdin_handle) = child.stdin {
                use std::io::Write;
                stdin_handle
                    .write_all(stdin.as_bytes())
                    .expect("Failed to write to stdin");
            }
        }
        let status = child.wait().expect("Failed to wait for exe");
        status.code().unwrap_or(-1)
    }

    let generated_result = compile(source);
    if let Err(error) = generated_result {
        panic!("{}", error);
    }

    let generated: String = generated_result.unwrap();
    let temp_path = save_to_temp_path(&generated.as_str());
    let temp_exe = compile_temp_path_using_clang(temp_path.as_str());
    let actual_exit_code = execute_temp_exe(temp_exe.as_str(), std_in);

    // Cleanup
    let _ = std::fs::remove_file(&temp_path);
    let _ = std::fs::remove_file(&temp_exe);

    if actual_exit_code != expected_exit_code {
        panic!(
            "Expected exit code '{}' but was actually '{}'. Generated: '{}'",
            expected_exit_code, actual_exit_code, generated
        );
    }
}

#[allow(dead_code)]
fn expect_invalid(source: &str) {
    let result = compile(source);
    if let Ok(generated) = result {
        panic!(
            "Expected an error but compiler actually produced: '{}'",
            generated
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_source() {
        expect_valid("", "", 0);
    }

    #[test]
    fn test_whitespace_source() {
        expect_valid(" ", "", 0);
    }

    #[test]
    fn test_read_stdin() {
        expect_valid("read()", "1", 1);
    }

    #[test]
    fn test_read_stdin_multiple() {
        expect_valid("read()", "1 2", 1);
    }

    #[test]
    fn test_read_with_whitespace() {
        expect_valid(" read() ", "1 2", 1);
    }

    #[test]
    fn test_read_add_read() {
        expect_valid("read() + read()", "1 2", 3);
    }

    #[test]
    fn test_read_add_read_add_read() {
        expect_valid("read() + read() + read()", "1 2 3", 6);
    }

    #[test]
    fn test_read_add_read_sub_read() {
        expect_valid("read() + read() - read()", "3 4 5", 2);
    }

    #[test]
    fn test_read_with_braces() {
        expect_valid("read() + { read() - read() }", "3 4 5", 2);
    }

    #[test]
    fn test_read_with_let() {
        expect_valid("read() + { let x = read() - read(); x }", "3 4 5", 2);
    }

    #[test]
    fn test_nested_let() {
        expect_valid(
            "let y = read() + { let x = read() - read(); x }; y",
            "3 4 5",
            2,
        );
    }

    #[test]
    fn test_array_let() {
        expect_valid("let y = [read()]; y[0]", "3", 3);
    }

    #[test]
    fn test_nested_array_let() {
        expect_valid("let y = [[read()]]; y[0][0]", "3", 3);
    }

    #[test]
    fn test_nested_array_literal() {
        expect_valid("let y = [[ 3 ]]; y[0][0]", "", 3);
    }

    #[test]
    fn test_typed_let() {
        expect_valid("let x : I32 = 100; x", "", 100);
    }

    #[test]
    fn test_simple_let_exit_zero() {
        expect_valid("let x = 100;", "", 0);
    }

    #[test]
    fn test_u8_literal() {
        expect_valid("100U8", "", 100);
    }

    #[test]
    fn test_u8_literal_out_of_range() {
        expect_invalid("256U8");
    }

    #[test]
    fn test_u8_literal_negative() {
        expect_invalid("-1U8");
    }

    #[test]
    fn test_typed_let_array_mismatch() {
        expect_invalid("let x : I32 = [100]; x");
    }

    #[test]
    fn test_typed_array_let() {
        expect_valid("let x : [I32; 1] = [100]; x[0]", "", 100);
    }

    #[test]
    fn test_typed_array_size_mismatch() {
        expect_invalid("let x : [I32; 1] = []; x[0]");
    }

    #[test]
    fn test_typed_array_scalar_rhs() {
        expect_invalid("let x = read(); let y : [I32; 3] = x;");
    }

    #[test]
    fn test_mut_reassign() {
        expect_valid("let mut x = read(); x = read(); x", "1 2", 2);
    }

    #[test]
    fn test_mut_compound_assign() {
        expect_valid("let mut x = read(); x += read(); x", "1 3", 4);
    }

    #[test]
    fn test_compound_assign_without_mut() {
        expect_invalid("let x = read(); x += read(); x");
    }

    #[test]
    fn test_reassign_without_mut() {
        expect_invalid("let x = read(); x = read(); x");
    }

    #[test]
    fn test_mut_array_element_assign() {
        expect_valid("let mut x = [read()]; x[0] = read(); x[0]", "1 2", 2);
    }

    #[test]
    fn test_array_element_assign_without_mut() {
        expect_invalid("let x = [read()]; x[0] = read(); x[0]");
    }

    #[test]
    fn test_array_repeat_syntax() {
        expect_valid("let x = [10; 2]; x[0] + x[1]", "", 20);
    }

    #[test]
    fn test_array_repeat_with_read() {
        expect_valid("let x = [read(); 2]; x[0] + x[1]", "2 5", 4);
    }

    #[test]
    fn test_bool_read_generic() {
        expect_valid("let x : Bool = read<Bool>(); x", "true", 1);
    }

    #[test]
    fn test_bool_or_false_literal() {
        expect_valid("let x : Bool = read<Bool>(); x || false", "true", 1);
    }

    #[test]
    fn test_bool_and_false_literal() {
        expect_valid("let x : Bool = read<Bool>(); x && false", "true", 0);
    }

    #[test]
    fn test_less_than_comparison() {
        expect_valid("read() < read()", "1 2", 1);
    }

    #[test]
    fn test_equality_comparison_false() {
        expect_valid("read() == read()", "1 2", 0);
    }

    #[test]
    fn test_if_else_bool_read() {
        expect_valid("if (read<Bool>()) 3 else 5", "true", 3);
    }

    #[test]
    fn test_let_with_if_else() {
        expect_valid("let x = if (read<Bool>()) 3 else 5; x", "true", 3);
    }

    #[test]
    fn test_mut_reassign_in_block() {
        expect_valid("let mut x = read(); { x = read(); } x", "1 3", 3);
    }

    #[test]
    fn test_let_shadowing() {
        expect_valid("let x = read(); let x = read(); x", "1 3", 3);
    }

    #[test]
    fn test_if_with_mut_reassign() {
        expect_valid(
            "let mut x = 0; if (read<Bool>()) x = read(); x",
            "true 3",
            3,
        );
    }

    #[test]
    fn test_if_else_with_mut_reassign() {
        // All reads are eagerly evaluated at top of main(), so both branch reads need input.
        expect_valid(
            "let mut x = 0; if (read<Bool>()) x = read(); else x = read() + 1; x",
            "false 0 8",
            9,
        );
    }

    #[test]
    fn test_if_else_brace_blocks_with_mut_reassign() {
        // Explicit brace-delimited if/else blocks with assignments inside.
        // All reads are eagerly evaluated at top of main(), so both branch reads need input.
        expect_valid(
            "let mut x = 0; if (read<Bool>()) { x = read(); } else { x = read() + 1; } x",
            "false 0 8",
            9,
        );
    }

    #[test]
    fn test_while_loop_with_mut_reassign() {
        expect_valid(
            "let mut x = 0; let total = read(); while (x < total) x += 1; x",
            "4",
            4,
        );
    }

    #[test]
    fn test_for_loop_with_mut_reassign() {
        expect_valid(
            "let mut sum = 0; for (i in 0..read()) sum += i; sum",
            "4",
            6,
        );
    }

    #[test]
    fn test_function_call_forwarding_read() {
        expect_valid("fn get() => read(); get()", "100", 100);
    }

    #[test]
    fn test_fn_with_params_and_type_annotation() {
        expect_valid(
            "fn add(offset : I32) : I32 => read() + offset; add(2)",
            "1",
            3,
        );
    }

    #[test]
    fn test_empty_struct() {
        expect_valid("struct Empty {}", "", 0);
    }

    #[test]
    fn test_struct_with_field() {
        expect_valid("struct Empty { field : I32 }", "", 0);
    }

    #[test]
    fn test_struct_duplicate_fields() {
        expect_invalid("struct Empty { field : I32, field : I32 }");
    }

    #[test]
    fn test_struct_duplicate_definition() {
        expect_invalid("struct Empty {} struct Empty {}");
    }

    #[test]
    fn test_struct_unknown_field_type() {
        expect_invalid("struct Wrapper { field : UnknownType }");
    }

    #[test]
    fn test_struct_missing_field_type() {
        expect_invalid("struct Wrapper { field }");
    }

    #[test]
    fn test_struct_as_field_type() {
        expect_valid(
            "struct Point { x : I32, y : I32 } struct Wrapper { point : Point };",
            "",
            0,
        );
    }

    #[test]
    fn test_generic_struct_as_field_type() {
        expect_valid(
            "struct Wrapper<T> { value : T } struct Container { wrapper : Wrapper<I32> };",
            "",
            0,
        );
    }

    #[test]
    fn test_generic_struct_with_str_type_arg() {
        expect_valid(
            "struct Wrapper<T> { value : T } struct Container { wrapper : Wrapper<&Str> };",
            "",
            0,
        );
    }

    #[test]
    fn test_construct_struct_with_generic_field() {
        expect_valid(
            "struct Wrapper<T> { value : T } struct Container { wrapper : Wrapper<I32> } let c : Container = Container { wrapper : Wrapper<I32> { value : read() } }; c.wrapper.value",
            "42",
            42,
        );
    }

    #[test]
    fn test_empty_struct_instantiation() {
        expect_valid("struct Empty {} let empty : Empty = Empty {};", "", 0);
    }

    #[test]
    fn test_struct_field_access_with_read() {
        expect_valid(
            "struct Wrapper { field : I32 } let wrapper : Wrapper = Wrapper { field : read() }; wrapper.field",
            "100",
            100,
        );
    }

    #[test]
    fn test_generic_struct_field_access_with_read() {
        expect_valid(
            "struct Wrapper<T> { field : T } let wrapper : Wrapper<I32> = Wrapper<I32> { field : read() }; wrapper.field",
            "100",
            100,
        );
    }

    #[test]
    fn test_generic_function_call() {
        expect_valid(
            "fn pass<T>(param : T) => param; pass<I32>(read()) + 1",
            "5",
            6,
        );
    }

    #[test]
    fn test_is_type_check() {
        expect_valid("100 is I32", "", 1);
    }

    #[test]
    fn test_not_operator() {
        expect_valid("!0", "", 1);
    }

    #[test]
    fn test_not_operator_false() {
        expect_valid("!1", "", 0);
    }

    #[test]
    fn test_is_type_check_with_let() {
        expect_valid("let x = 100; x is I32", "", 1);
    }

    #[test]
    fn test_is_type_check_mismatch() {
        expect_valid("let x = 100; x is I64", "", 0);
    }

    #[test]
    fn test_i64_literal_type_check() {
        expect_valid("let x = 100I64; x is I64", "", 1);
    }

    #[test]
    fn test_type_alias_is_check() {
        expect_valid(
            "type MyAlias = I32; let temp : MyAlias = 100; temp is MyAlias && temp is I32",
            "",
            1,
        );
    }

    #[test]
    fn test_union_type_is_check() {
        expect_valid(
            "type MyUnion = I32 | Bool; let value : MyUnion = if (read<Bool>()) 3 else true; value is Bool",
            "false",
            1,
        );
    }

    #[test]
    fn test_string_length() {
        expect_valid("let str : &Str = \"foo\"; str.length", "", 3);
    }

    #[test]
    fn test_union_type_with_structs() {
        expect_valid(
            "struct Ok { value : I32 } struct Err { error : &Str } type Result = Ok | Err; let result : Result = Ok { value : read() }; result is Ok",
            "3",
            1,
        );
    }

    #[test]
    fn test_union_type_with_if_else() {
        expect_valid(
            "struct Ok { value : I32 } struct Err { error : &Str } type Result = Ok | Err; let result : Result = if (read<Bool>()) Ok { value : read() } else Err { error : \"foo\" }; result is Ok",
            "false",
            0,
        );
    }
}
