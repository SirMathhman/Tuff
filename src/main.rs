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
    rest_params: Vec<(String, String)>, // (name, type) for rest parameters like "...args : [I32; L]"
    body: String,
    return_type: Option<String>, // optional return type annotation (may contain type params)
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
    function_return_types: HashMap<String, String>, // function name -> return type
    extern_functions: HashMap<String, (Vec<String>, Vec<String>, String)>, // name -> (param_names, param_types, return_type)
    extern_includes: Vec<String>, // C headers to include (e.g., "stdlib.h")
    extern_types: HashSet<String>, // C type names imported via extern let { type ... }
    captured_vars: HashSet<String>, // outer variables captured by functions (need static globals)
    this_refs: HashSet<String>, // variables that are this-references (resolve .x to variable x)
    this_param_functions: HashSet<String>, // functions that take &this as a receiver parameter
    factory_method_instances: HashMap<String, String>, // method name -> instance struct type (e.g., "add" -> "Counter_ret")
    nested_function_parent: HashMap<String, String>, // child function name -> parent function name
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
            function_return_types: HashMap::new(),
            extern_functions: HashMap::new(),
            extern_includes: Vec::new(),
            extern_types: HashSet::new(),
            captured_vars: HashSet::new(),
            this_refs: HashSet::new(),
            this_param_functions: HashSet::new(),
            factory_method_instances: HashMap::new(),
            nested_function_parent: HashMap::new(),
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

/// Strip line comments (// ...) from source, handling string literals.
fn strip_line_comments(source: &str) -> String {
    let mut result = String::new();
    let mut in_string = false;
    let mut escaped = false;
    let chars: Vec<char> = source.chars().collect();
    let len = chars.len();
    let mut i = 0;
    while i < len {
        let ch = chars[i];
        if escaped {
            result.push(ch);
            escaped = false;
            i += 1;
            continue;
        }
        if ch == '\\' && in_string {
            result.push(ch);
            escaped = true;
            i += 1;
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            result.push(ch);
            i += 1;
            continue;
        }
        if !in_string && ch == '/' && i + 1 < len && chars[i + 1] == '/' {
            // Skip until end of line
            i += 2;
            while i < len && chars[i] != '\n' {
                i += 1;
            }
            // Keep the newline
            if i < len {
                result.push('\n');
                i += 1;
            }
            continue;
        }
        result.push(ch);
        i += 1;
    }
    result
}

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
    // compile_expression is a deeply recursive-descent parser with large per-call
    // stack frames; Windows' default 1 MiB main-thread stack isn't enough for
    // realistically-sized .tuff files, so run the work on a thread with a larger stack.
    std::thread::Builder::new()
        .stack_size(64 * 1024 * 1024)
        .spawn(run)
        .expect("Failed to spawn compiler thread")
        .join()
        .expect("Compiler thread panicked");
}

fn run() {
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
                .map(|p| {
                    // Extract just the name part, ignoring constraints like ": USize"
                    let p = p.trim();
                    if let Some(colon_pos) = p.find(':') {
                        p[..colon_pos].trim().to_string()
                    } else {
                        p.to_string()
                    }
                })
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
    build_c_function_with_return_type(func_name, param_names, fn_read_entries, fn_body_stmts, fn_return_expr, "int", None)
}

/// Build a C function with a custom return type and optional array return wrapper.
fn build_c_function_with_return_type(
    func_name: &str,
    param_names: &[String],
    fn_read_entries: &[(usize, ReadType)],
    fn_body_stmts: &str,
    fn_return_expr: &str,
    return_type: &str,
    array_size: Option<usize>,
) -> String {
    let param_sig: Vec<String> = param_names.iter().map(|n| format!("int {}", n)).collect();
    let sig_str = if param_sig.is_empty() {
        "void"
    } else {
        &param_sig.join(", ")
    };
    let mut c_func = String::new();

    // If returning an array, use the struct wrapper type (typedef generated elsewhere)
    if let Some(_size) = array_size {
        let ret_struct = format!("{}_ret", func_name);
        c_func.push_str(&format!("{} {}({}) {{\n", ret_struct, func_name, sig_str));
    } else {
        c_func.push_str(&format!("{} {}({}) {{\n", return_type, func_name, sig_str));
    }

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

    if let Some(_size) = array_size {
        let ret_struct = format!("{}_ret", func_name);
        let return_line = format!("\t\treturn ({0}){{.data = {1}}};\n\t}}\n", ret_struct, fn_return_expr);
        c_func.push_str(&return_line);
    } else if return_type == "void" && fn_return_expr.is_empty() {
        // Void function with no return expression — just close the body
        c_func.push_str("}\n");
    } else {
        c_func.push_str(&format!("\t\treturn {};\n}}\n", fn_return_expr));
    }
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

/// Generate extern declarations, captured variable globals, and rewrite C body
/// to convert declarations to assignments for captured variables.
/// The `space_prefix` controls spacing before `=` in the replacement (varies by branch context).
fn prepare_captured_vars(ctx: &CompileContext, c_body: &str, space_prefix: &str) -> (String, String, String) {
    let extern_decls = generate_extern_decls(ctx);

    // Generate static globals for captured variables (outer vars used by functions)
    let mut captured_globals = String::new();
    for var in &ctx.captured_vars {
        captured_globals.push_str(&format!("static int {};\n", var));
    }

    // Rewrite C body: replace "int x = ..." with "x = ..." for captured vars
    let mut c_body_fixed = c_body.to_string();
    for var in &ctx.captured_vars {
        let old_decl = format!("int {} =", var);
        let new_assign = format!("{} {} =", space_prefix, var);
        c_body_fixed = c_body_fixed.replace(&old_decl, &new_assign);
    }

    (extern_decls, captured_globals, c_body_fixed)
}

fn compile(source: &str) -> Result<String, CompileError> {
    let trimmed = source.trim();
    eprintln!("[compile] source: '{}'", trimmed);
    if trimmed.is_empty() {
        return Ok(String::from("int main() {\n\treturn 0;\n}\n"));
    }

    // Strip line comments before processing
    let no_comments = strip_line_comments(trimmed);

    // Strip fn bodies from source before scanning for top-level reads.
    let stripped_for_reads = strip_fn_bodies(&no_comments);

    // Find all reads in source order and assign variables sequentially.
    let read_entries = find_reads_in_order(&stripped_for_reads);
    let read_count = read_entries.len();
    let vars: Vec<String> = (0..read_count).map(|i| format!("v{}", i)).collect();

    // Parse let declarations and build C body
    let mut ctx = CompileContext::new(vars.clone());
    let (c_body, return_expr) = compile_expression(&no_comments, &mut ctx)?;

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
        // Add extern includes
        let mut all_includes = includes.to_string();
        for inc in &ctx.extern_includes {
            all_includes.push_str(&format!("\n#include <{}>", inc));
        }
        let buf_decl = if has_bool_reads {
            "\tchar buf[64];"
        } else {
            ""
        };

        let (c_func_typedefs, c_prototypes, c_functions) = generate_function_code(&ctx.generated_functions, &ctx.function_return_types, &ctx.captured_vars);

        // Generate struct and union typedefs
        let (c_structs, c_unions) = generate_typedefs(&ctx);

        let (extern_decls, captured_globals, c_body_fixed) = prepare_captured_vars(&ctx, &c_body, " ");

        let final_return = resolve_final_return(&return_expr, &ctx);
        Ok(format!(
            "{}\n{}\n{}\n{}\n{}\n{}int main() {{\n{}\n{}\n\t{}\n\t{}\n\treturn {};\n}}\n",
            all_includes,
            c_func_typedefs.trim(),
            format!(
                "{}\n{}\n{}",
                c_structs.trim(),
                c_unions.trim(),
                c_prototypes.trim()
            ),
            extern_decls.trim(),
            captured_globals.trim(),
            c_functions.trim(),
            buf_decl,
            c_decls.trim(),
            c_reads.trim(),
            c_body_fixed,
            final_return
        ))
    } else {
        let (c_func_typedefs, c_prototypes, c_functions) = generate_function_code(&ctx.generated_functions, &ctx.function_return_types, &ctx.captured_vars);

        // Generate struct and union typedefs
        let (c_structs, c_unions) = generate_typedefs(&ctx);

        // Check if any variable is of type &Str (needs string.h for strlen)
        let has_str_type = ctx
            .var_types
            .values()
            .any(|types| types.iter().any(|t| t == "&Str"));

        // Include stdio.h if any generated functions use scanf (have local reads) or structs exist
        let mut includes = if !c_functions.is_empty() || !c_structs.is_empty() || has_str_type {
            "#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>".to_string()
        } else {
            String::new()
        };
        // Add extern includes
        for inc in &ctx.extern_includes {
            if includes.is_empty() {
                includes = format!("#include <{}>", inc);
            } else {
                includes.push_str(&format!("\n#include <{}>", inc));
            }
        }

        let (extern_decls, captured_globals, c_body_fixed) = prepare_captured_vars(&ctx, &c_body, "");

        let final_return = resolve_final_return(&return_expr, &ctx);
        Ok(format!(
            "{}\n{}\n{}\n{}\n{}\n{}int main() {{\n\t{}\n\treturn {};\n}}\n",
            includes,
            c_func_typedefs.trim(),
            format!(
                "{}\n{}\n{}",
                c_structs.trim(),
                c_unions.trim(),
                c_prototypes.trim()
            ),
            extern_decls.trim(),
            captured_globals.trim(),
            c_functions.trim(),
            c_body_fixed,
            final_return
        ))
    }
}

/// Generate C extern function declarations for FFI.
/// Returns empty string — extern functions are declared in the included headers,
/// and generating duplicate declarations can conflict with the real signatures.
fn generate_extern_decls(_ctx: &CompileContext) -> String {
    String::new()
}

/// Generate C function prototypes and definitions from compiled functions.
fn generate_function_code(functions: &[(String, Vec<String>, String)], function_return_types: &HashMap<String, String>, captured_vars: &HashSet<String>) -> (String, String, String) {
    let mut c_typedefs = String::new();
    let mut c_prototypes = String::new();
    for (name, params, _func_code) in functions {
        let return_type = if let Some(ret) = function_return_types.get(name) {
            if ret == "Void" {
                "void".to_string()
            } else if ret.starts_with('[') {
                let size = parse_array_size(ret).unwrap_or(1);
                let ret_struct = format!("{}_ret", name);
                c_typedefs.push_str(&format!("typedef struct {{ int data[{}]; }} {};\n", size, ret_struct));
                ret_struct
            } else if ret.ends_with("_ret") {
                // Struct return type from `this`-returning functions (e.g., "Wrapper_ret")
                ret.clone()
            } else {
                "int".to_string()
            }
        } else {
            "int".to_string()
        };
        if params.is_empty() {
            c_prototypes.push_str(&format!("{} {}(void);\n", return_type, name));
        } else {
            let param_sig: Vec<String> = params.iter().map(|p| {
                if p.contains('*') {
                    p.clone() // Already a full type like "Counter_ret* instance"
                } else {
                    format!("int {}", p)
                }
            }).collect();
            c_prototypes.push_str(&format!("{} {}({});\n", return_type, name, param_sig.join(", ")));
        }
    }

    let mut c_functions = String::new();
    for (_name, params, func_code) in functions {
        // If any parameter is a captured var, rename it in the signature to avoid shadowing
        // the static global, then insert an assignment to copy the value to the global.
        let mut rewritten = func_code.clone();
        for param in params {
            if captured_vars.contains(param) {
                let renamed = format!("{}_arg", param);
                // Rename parameter in function signature: "int param" -> "int param_arg"
                let old_sig = format!("int {}", param);
                let new_sig = format!("int {}", renamed);
                rewritten = rewritten.replace(&old_sig, &new_sig);
                // Insert assignment right after the opening brace
                if let Some(brace_pos) = rewritten.find('{') {
                    let before_brace = &rewritten[..=brace_pos];
                    let after_brace = &rewritten[brace_pos + 1..];
                    let assignment = format!("\t\t{} = {};\n", param, renamed);
                    rewritten = format!("{}{}{}", before_brace, assignment, after_brace);
                }
            }
        }
        c_functions.push_str(&rewritten);
        c_functions.push('\n');
    }

    // Rewrite captured var declarations inside function bodies:
    // "int counter =" -> "counter =" so they don't shadow the static global
    for var in captured_vars {
        let old_decl = format!("int {} =", var);
        let new_assign = format!("{} {} =", "", var);
        c_functions = c_functions.replace(&old_decl, &new_assign);
    }

    (c_typedefs, c_prototypes, c_functions)
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

/// Extract the function name from a call expression like "get_3(100)" and look up its return type.
/// Handles generic calls like "get<3>(100)" by looking up the template and computing the concrete return type.
/// Also handles inferred generic calls like "toArray(1, 2, 4)" by inferring type args from argument count.
fn get_function_call_return_type(ctx: &CompileContext, expr: &str) -> Option<String> {
    let trimmed = expr.trim();
    if let Some(paren_pos) = trimmed.find('(') {
        let raw_name = trimmed[..paren_pos].trim();
        // Check if this is a generic call "get<3>"
        if let Some(angle_start) = raw_name.find('<') {
            if let Some(angle_end) = raw_name.find('>') {
                let base = raw_name[..angle_start].trim();
                let type_args_str = &raw_name[angle_start + 1..angle_end];
                let type_args: Vec<&str> = type_args_str.split(',').map(|a| a.trim()).collect();
                // Look up the template
                if let Some(template) = ctx.generic_functions.iter().find(|t| t.name == base) {
                    if let Some(ref ret_type) = template.return_type {
                        let mut concrete_ret = ret_type.clone();
                        for (type_param, concrete_type) in template.type_params.iter().zip(type_args.iter()) {
                            concrete_ret = concrete_ret.replace(type_param, concrete_type);
                        }
                        return Some(concrete_ret);
                    }
                }
            }
        } else {
            // Non-generic call - look up directly first
            if let Some(ret) = ctx.function_return_types.get(raw_name) {
                return Some(ret.clone());
            }
            // Try to infer from generic function template with rest params
            if let Some(template) = ctx.generic_functions.iter().find(|t| t.name == raw_name) {
                // Count arguments in the call - find matching paren from the full expression
                let after_paren = &trimmed[paren_pos..];
                if let Some(args_end) = find_matching_paren(after_paren) {
                    let args_inner = &after_paren[1..args_end].trim();
                    let arg_count = if args_inner.is_empty() { 0 } else { args_inner.split(',').count() };
                    if let Some(inferred) = infer_rest_param_types(template, arg_count) {
                        if let Some(ref ret_type) = template.return_type {
                            let mut concrete_ret = ret_type.clone();
                            for (type_param, concrete_type) in template.type_params.iter().zip(inferred.iter()) {
                                concrete_ret = concrete_ret.replace(type_param, concrete_type);
                            }
                            return Some(concrete_ret);
                        }
                    }
                }
            }
        }
    }
    None
}

/// Infer type args for a generic function with rest params based on argument count.
/// Returns a vector of concrete type strings (e.g., ["3"] for L=3).
fn infer_rest_param_types(template: &GenericFunctionTemplate, arg_count: usize) -> Option<Vec<String>> {
    if template.rest_params.is_empty() {
        return None;
    }
    let mut inferred: Vec<String> = Vec::new();
    for type_param in &template.type_params {
        let rest_type = &template.rest_params[0].1;
        if rest_type.contains(type_param) {
            inferred.push(arg_count.to_string());
        } else {
            inferred.push(type_param.clone());
        }
    }
    if inferred.len() == template.type_params.len() {
        Some(inferred)
    } else {
        None
    }
}

/// Check if a generic function call has an array return type and return the array size.
#[allow(dead_code)]
fn get_generic_call_array_length(ctx: &CompileContext, expr: &str) -> Option<usize> {
    if let Some(ret_type) = get_function_call_return_type(ctx, expr) {
        if ret_type.starts_with('[') {
            return parse_array_size(&ret_type);
        }
    }
    None
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

/// Split a string by commas at the top level (not inside <...>, [...], or {...}).
fn split_top_level_commas(s: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0;
    let mut start = 0;
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    let mut i = 0;
    while i < len {
        let ch = chars[i];
        match ch {
            '<' | '[' | '{' | '(' => depth += 1,
            '>' | ']' | '}' | ')' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(&s[start..i]);
                start = i + 1;
            }
            _ => {}
        }
        i += 1;
    }
    parts.push(&s[start..]);
    parts
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

/// Compile an array repeat expression "[value; count]" into C initializer syntax.
/// Returns (C body statements, C initializer expression).
fn compile_array_repeat_expr(
    trimmed: &str,
    ctx: &mut CompileContext,
) -> Result<(String, String), CompileError> {
    if let Some((repeat_value, repeat_count)) = parse_array_repeat(trimmed) {
        let (val_body, val_result) = compile_expression(repeat_value, ctx)?;
        let repeated: Vec<_> = (0..repeat_count).map(|_| val_result.clone()).collect();
        let init = format!("{{{}}}", repeated.join(", "));
        Ok((val_body, init))
    } else {
        Err("Not an array repeat expression".to_string())
    }
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
    if let Ok((val_body, init)) = compile_array_repeat_expr(trimmed, ctx) {
        let repeat_count = parse_array_repeat(trimmed).map(|(_, c)| c).unwrap_or(0);
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

    // Handle parenthesized expressions: "(expr)" => compile inner expr
    // But NOT tuple literals like "(3, 4)" which contain commas at the top level
    if trimmed.starts_with('(') && trimmed.ends_with(')') {
        if let Some(paren_end) = find_matching_paren(trimmed) {
            let inner = &trimmed[1..paren_end].trim();
            // Check if this is a tuple literal (contains top-level commas)
            let has_top_level_comma = find_top_level_char(inner, ',').is_some();
            if !has_top_level_comma {
                let (body, result) = compile_expression(inner, ctx)?;
                return Ok((body, format!("({})", result)));
            }
        }
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
        && !trimmed.starts_with("extern ")
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
                // Handle "this.x = val" -> resolve to "x = val"
                let effective_var = if let Some(field) = base_var.strip_prefix("this.") {
                    field
                } else {
                    base_var
                };
                // Check if variable was declared as mutable
                if !ctx.mutable_vars.iter().any(|v| v == effective_var) {
                    return Err(format!("Cannot reassign immutable variable '{}'", effective_var));
                }
                let rhs = assign_part[rhs_start_offset..].trim();
                let (assign_body, assign_result) = compile_expression(rhs, ctx)?;
                // Use effective_var for C code when it's a this.x case (dots not valid in C for this),
                // otherwise use the original var_name (e.g., for array element access like "x[0]")
                let c_target = if base_var.starts_with("this.") {
                    effective_var
                } else {
                    var_name
                };
                let c_body = match op {
                    Some(op_char) => format!(
                        "{}\n\t{} {}= {};",
                        assign_body, c_target, op_char, assign_result
                    ),
                    None => format!("{}\n\t{} = {};", assign_body, c_target, assign_result),
                };
                let final_result = compile_expression(final_part, ctx).map(|r| r.1)?;
                return Ok((c_body, final_result));
            }
            // Not an assignment — treat as a statement (e.g., function call) followed by final expression
            let (stmt_body, stmt_result) = compile_expression(assign_part, ctx)?;
            let (final_body, final_result) = compile_expression(final_part, ctx)?;
            let stmt_line = if stmt_result.is_empty() {
                stmt_body
            } else if stmt_body.is_empty() {
                format!("\t{};", stmt_result)
            } else {
                format!("{}\n\t{};", stmt_body, stmt_result)
            };
            let combined_body = if stmt_line.is_empty() {
                final_body
            } else if final_body.is_empty() {
                stmt_line
            } else {
                format!("{}\n{}", stmt_line, final_body)
            };
            return Ok((combined_body, final_result));
        }
    }

    // Check for struct destructuring: "let { x, y } = StructName { ... }; <final>"
    if let Some(rest) = trimmed.strip_prefix("let ") {
        let rest_trimmed = rest.trim_start();
        if rest_trimmed.starts_with('{') {
            if let Some(closing_brace) = find_matching_brace(rest_trimmed) {
                let pattern = &rest_trimmed[1..closing_brace];
                let after_pattern = rest_trimmed[closing_brace + 1..].trim_start();
                // Expect "= StructName { ... }"
                if let Some(eq_pos) = after_pattern.find('=') {
                    let after_eq = after_pattern[eq_pos + 1..].trim_start();
                    // Find the struct instantiation by locating the opening brace
                    let struct_name = after_eq.split(|c| c == '{' || c == '<').next().unwrap_or("").trim();
                    // Find the matching brace for the struct instantiation
                    let (rhs, after_rhs) = if let Some(brace_pos) = after_eq.find('{') {
                        if let Some(matching_brace) = find_matching_brace(&after_eq[brace_pos..]) {
                            let end = brace_pos + matching_brace + 1;
                            (after_eq[..end].trim(), after_eq[end..].trim_start())
                        } else {
                            (after_eq, "")
                        }
                    } else {
                        (after_eq, "")
                    };
                    // Extract the final part after semicolon
                    let final_part = if let Some(semi_pos) = find_top_level_semicolon(after_rhs) {
                        &after_rhs[semi_pos + 1..]
                    } else {
                        ""
                    };
                    // Extract field names from pattern: "x, y"
                    let fields: Vec<&str> = pattern.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
                    // Generate a temporary variable for the struct instance
                    let tmp_var = format!("__tmp_{}", struct_name.to_lowercase());
                    // Compile the RHS expression to get the struct value
                    let (rhs_body, rhs_result) = compile_expression(rhs, ctx)?;
                    // Generate: Point __tmp_point = (Point){.x = 3, .y = 4};
                    let mut c_body = rhs_body.clone();
                    c_body.push_str(&format!("\n\t{} {} = {};", struct_name, tmp_var, rhs_result));
                    // Generate individual let declarations for each field
                    for field in &fields {
                        ctx.declared_vars.insert((*field).to_string());
                        c_body.push_str(&format!("\n\tint {} = {}.{};", field, tmp_var, to_lower_first(field)));
                    }
                    let final_result = compile_expression(final_part, ctx)?;
                    return Ok((format!("{}\n\t{}", c_body, final_result.0), final_result.1));
                }
            }
        }
    }

    // Check for let declaration pattern: "let x = <expr>; <final>"
    if let Some(decl_expr) = trimmed.strip_prefix("let ") {
        // Find the top-level semicolon (not inside braces), or treat entire expr as declaration
        let (decl_part, final_part) = if let Some(semi_pos) = find_top_level_semicolon(decl_expr) {
            (&decl_expr[..semi_pos], &decl_expr[semi_pos + 1..])
        } else {
            (decl_expr, "")
        };

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
            // Skip this check for pointer-to-array types where RHS is an address-of expression
            if let Some(ty) = &type_annotation {
                if ty.contains('[') && !after_eq.starts_with('[') && !ty.starts_with('&') {
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

            // If RHS is "this", mark this variable as a this-reference
            if after_eq.trim() == "this" {
                ctx.this_refs.insert(var_name.to_string());
            }
            // If RHS is a call to a `this`-returning function (e.g., "Counter()"),
            // mark this variable as a this-reference too
            let rhs_trimmed = after_eq.trim();
            if let Some(paren_pos) = rhs_trimmed.find('(') {
                let call_name = rhs_trimmed[..paren_pos].trim();
                if let Some(ret_type) = ctx.function_return_types.get(call_name) {
                    if ret_type.ends_with("_ret") {
                        ctx.this_refs.insert(var_name.to_string());
                    }
                }
            }

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
                let rhs_concrete_name = if let Some(angle_start) = after_eq.find('<') {
                    // Generic instantiation: find matching '>' by tracking depth
                    let base = after_eq[..angle_start].trim();
                    let rest = &after_eq[angle_start + 1..];
                    let mut depth = 1; // start at 1 for the opening '<'
                    let mut angle_end = None;
                    for (i, ch) in rest.chars().enumerate() {
                        match ch {
                            '<' | '(' | '[' => depth += 1,
                            '>' | ')' | ']' => {
                                depth -= 1;
                                if depth == 0 {
                                    angle_end = Some(i);
                                    break;
                                }
                            }
                            _ => {}
                        }
                    }
                    if let Some(end) = angle_end {
                        let type_args_str = &rest[..end];
                        let concrete_name = build_concrete_name(base, type_args_str);
                        if ctx.defined_structs.contains(base) || ctx.defined_structs.contains(&concrete_name) {
                            Some(concrete_name)
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else if let Some(word) = after_eq.split_whitespace().next() {
                    // Non-generic struct: "Ok" -> "Ok" (only if it's a defined struct)
                    let base = word;
                    if ctx.defined_structs.contains(base) {
                        Some(base.to_string())
                    } else {
                        None
                    }
                } else {
                    None
                };
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
                    .unwrap_or_else(|| {
                        // Check if RHS is a call to a registered extern function
                        let call_name = after_eq.split('(').next().unwrap_or("").trim();
                        if let Some((_params, _ptypes, ret_type)) = ctx.extern_functions.get(call_name) {
                            ret_type.clone()
                        } else if let Some(ret_type) = ctx.function_return_types.get(call_name) {
                            // Infer return type from user-defined function (e.g., "Counter_ret" -> "Counter")
                            if ret_type.ends_with("_ret") {
                                ret_type[..ret_type.len() - 4].to_string()
                            } else {
                                ret_type.clone()
                            }
                        } else {
                            infer_literal_type(after_eq)
                        }
                    });
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
                    // For pointer-to-array types, cast the RHS address-of to element pointer
                    let decl_result_final = if let Some(ref ty) = type_annotation {
                        if ty.starts_with('&') && ty[1..].trim().starts_with('[') {
                            let target_c = tuff_type_to_c(ctx, ty).unwrap_or_else(|_| "void *".to_string());
                            format!("(({})({}))", target_c, decl_result)
                        } else {
                            decl_result.clone()
                        }
                    } else {
                        decl_result.clone()
                    };
                    format!(
                        "{}\n\t{} {} = {};",
                        decl_body, c_type, var_name, decl_result_final
                    )
                }
            };

            let (final_body, final_result) = compile_expression(final_part, ctx)?;
            return Ok((format!("{}\n{}", c_decl, final_body), final_result));
    }

    // Handle blocks { ... } - check if block contains let declarations or assignments
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        let inner = &trimmed[1..trimmed.len() - 1].trim();
        // If inner content has statements (let decls, assignments with semicolons, or fn definitions), process recursively
        if inner.contains("let ") || inner.contains("fn ") || find_top_level_semicolon(inner).is_some() {
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
    // Skip this check if the expression starts with "if " or "fn " - let those handlers deal with brace-delimited branches.
    if !trimmed.starts_with("if ")
        && !trimmed.starts_with("fn ")
        && trimmed.contains('{')
        && (find_top_level_semicolon(trimmed).is_some()
            || trimmed.contains("{ let ")
            || trimmed.contains("= "))
    {
        eprintln!("[embedded_blocks] ENTERED: trimmed='{}'", trimmed);
        for (brace_pos, ch) in trimmed.char_indices() {
            if ch == '{' {
                // Skip braces that are a function body (`fn name(...) => { ... }`),
                // regardless of where the `fn` appears in the larger expression —
                // otherwise the body gets severed from its function definition.
                if trimmed[..brace_pos].trim_end().ends_with("=>") {
                    continue;
                }
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

    // Handle extern declarations: "extern let { name } = extern header; extern fn name(params) : Type;"
    if trimmed.starts_with("extern ") {
        let after_extern = trimmed[7..].trim_start();
        if after_extern.starts_with("let ") {
            // "extern let { name1, name2 } = extern header;"
            let after_let = after_extern[4..].trim_start();
            if let Some(closing_brace) = find_matching_brace(after_let) {
                let names_str = &after_let[1..closing_brace];
                let after_brace = after_let[closing_brace + 1..].trim_start();
                if let Some(eq_pos) = after_brace.find('=') {
                    let after_eq = after_brace[eq_pos + 1..].trim_start();
                    if let Some(semi_pos) = find_top_level_semicolon(after_eq) {
                        let header = after_eq[..semi_pos].trim();
                        let remaining = after_eq[semi_pos + 1..].trim();
                        // "extern stdlib" -> "stdlib.h"
                        let header_name = header.strip_prefix("extern ").unwrap_or(header);
                        let include_name = format!("{}.h", header_name);
                        if !ctx.extern_includes.contains(&include_name) {
                            ctx.extern_includes.push(include_name);
                        }
                        // Register each entry: 'type TypeName' -> extern type, plain name -> extern function
                        for entry in names_str.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
                            if let Some(type_name) = entry.strip_prefix("type ") {
                                ctx.extern_types.insert(type_name.trim().to_string());
                            } else {
                                ctx.extern_functions.entry(entry.to_string()).or_insert((Vec::new(), Vec::new(), String::new()));
                            }
                        }
                        if !remaining.is_empty() {
                            return compile_expression(remaining, ctx);
                        }
                        return Ok((String::new(), String::new()));
                    }
                }
            }
        } else if after_extern.starts_with("fn ") {
            // "extern fn name(params) : Type;"
            let after_fn = after_extern[3..].trim_start();
            let paren_pos = after_fn.find('(')
                .ok_or_else(|| format!("Invalid extern fn syntax: {}", after_fn))?;
            let func_name = after_fn[..paren_pos].trim();
            let params_str_start = paren_pos + 1;
            let params_paren_end = find_matching_paren(&after_fn[params_str_start - 1..])
                .ok_or_else(|| format!("Invalid extern fn syntax: missing closing paren"))?;
            let params_inner = &after_fn[params_str_start..params_str_start + params_paren_end - 1].trim();
            let after_params = &after_fn[params_str_start + params_paren_end..].trim();
            // Parse return type: ": Type;"
            let colon_pos = after_params.find(':')
                .ok_or_else(|| format!("Invalid extern fn syntax: missing return type"))?;
            let after_colon = after_params[colon_pos + 1..].trim();
            let semi_pos = find_top_level_semicolon(after_colon)
                .ok_or_else(|| format!("Invalid extern fn syntax: missing semicolon"))?;
            let ret_type = after_colon[..semi_pos].trim().to_string();
            let remaining = after_colon[semi_pos + 1..].trim();
            // Parse param names and types
            let mut param_names: Vec<String> = Vec::new();
            let mut param_types: Vec<String> = Vec::new();
            if !params_inner.is_empty() {
                for param in params_inner.split(',') {
                    let parts: Vec<&str> = param.trim().split(':').collect();
                    if !parts.is_empty() && !parts[0].trim().is_empty() {
                        param_names.push(parts[0].trim().to_string());
                        let ptype = if parts.len() > 1 { parts[1].trim().to_string() } else { "I32".to_string() };
                        param_types.push(ptype);
                    }
                }
            }
            ctx.extern_functions.insert(func_name.to_string(), (param_names, param_types, ret_type.clone()));
            ctx.function_return_types.insert(func_name.to_string(), ret_type);
            if !remaining.is_empty() {
                return compile_expression(remaining, ctx);
            }
            return Ok((String::new(), String::new()));
        }
        return Err(format!("Invalid extern syntax: {}", after_extern));
    }

    // Handle function definition: "fn name(params) => body; remaining"
    // Also handles generic functions: "fn name<T>(params) => body; remaining"
    if trimmed.starts_with("fn ") {
        eprintln!("[fn_handler] ENTERED: trimmed='{}'", trimmed);
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

        // Parse each parameter: "name : Type", "...name : Type" (rest), or just "name"
        let mut param_names: Vec<String> = Vec::new();
        let mut rest_params: Vec<(String, String)> = Vec::new(); // (name, type) for rest params
        let mut has_this_param = false;
        if !params_inner.is_empty() {
            for param in params_inner.split(',') {
                let param_trimmed = param.trim();
                if let Some(stripped) = param_trimmed.strip_prefix("...") {
                    // Rest parameter: "...args : [I32; L]"
                    let parts: Vec<&str> = stripped.split(':').collect();
                    let name = parts[0].trim().to_string();
                    let ptype = if parts.len() > 1 {
                        parts[1].trim().to_string()
                    } else {
                        String::new()
                    };
                    rest_params.push((name, ptype));
                } else if param_trimmed == "&this" || param_trimmed == "&mut this" {
                    // Receiver parameter: &this or &mut this - mark this function as having a this param
                    has_this_param = true;
                } else if let Some(rest) = param_trimmed.strip_prefix("this") {
                    // Receiver parameter: "this : &Factory" or "this : &TypeName"
                    let rest = rest.trim();
                    if rest.is_empty() || rest.starts_with(':') {
                        has_this_param = true;
                    } else {
                        let parts: Vec<&str> = param_trimmed.split(':').collect();
                        let name = parts[0].trim();
                        if !name.is_empty() {
                            param_names.push(name.to_string());
                        }
                    }
                } else {
                    let parts: Vec<&str> = param_trimmed.split(':').collect();
                    let name = parts[0].trim();
                    if !name.is_empty() {
                        param_names.push(name.to_string());
                    }
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
        let before_arrow = after_params[..arrow_pos].trim();
        // Extract return type if present (e.g., ": [I32; L]")
        let return_type = if let Some(colon_pos) = before_arrow.find(':') {
            Some(before_arrow[colon_pos + 1..].trim().to_string())
        } else {
            None
        };
        let body_and_rest = &after_params[arrow_pos + 2..].trim(); // skip "=>"
        eprintln!("[fn_handler] body_and_rest='{}'", body_and_rest);

        // Find the function body boundary: if body starts with '{', use matching brace;
        // otherwise fall back to top-level semicolon.
        let (func_body, remaining): (&str, &str) = if body_and_rest.starts_with('{') {
            eprintln!("[fn_handler] body starts with '{{', calling find_matching_brace");
            if let Some(brace_len) = find_matching_brace(body_and_rest) {
                eprintln!("[fn_handler] find_matching_brace returned Some({})", brace_len);
                let end = brace_len + 1; // include closing '}'
                let body = &body_and_rest[..end];
                let rest = body_and_rest[end..].trim_start();
                // Skip leading semicolon if present
                let rest = rest.strip_prefix(';').unwrap_or(rest).trim_start();
                eprintln!("[fn_handler] body='{}' rest='{}'", body, rest);
                (body, rest)
            } else {
                eprintln!("[fn_handler] find_matching_brace returned None, falling back to semicolon");
                // Fallback: use semicolon
                if let Some(semi_pos) = find_top_level_semicolon(body_and_rest) {
                    let body = &body_and_rest[..semi_pos];
                    let rest = &body_and_rest[semi_pos + 1..].trim();
                    eprintln!("[fn_handler] semicolon fallback: body='{}' rest='{}'", body, rest);
                    (body, rest)
                } else {
                    eprintln!("[fn_handler] no semicolon either, using all as body");
                    (body_and_rest, "")
                }
            }
        } else if let Some(semi_pos) = find_top_level_semicolon(body_and_rest) {
            let body = &body_and_rest[..semi_pos];
            let rest = &body_and_rest[semi_pos + 1..].trim();
            eprintln!("[fn_handler] semicolon path: body='{}' rest='{}'", body, rest);
            (body, rest)
        } else {
            eprintln!("[fn_handler] no brace or semicolon, using all as body");
            (body_and_rest, "")
        };

            // If this is a generic function, store the template for later monomorphization
            if !type_params.is_empty() {
                ctx.generic_functions.push(GenericFunctionTemplate {
                    name: func_name.clone(),
                    type_params,
                    param_names,
                    rest_params,
                    body: func_body.to_string(),
                    return_type,
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

            // Inherit outer context's declared vars and mutable vars so the function
            // can access and modify outer variables (closure-like behavior).
            for var in &ctx.declared_vars {
                fn_ctx.declared_vars.insert(var.clone());
            }
            for var in &ctx.mutable_vars {
                fn_ctx.mutable_vars.push(var.clone());
            }

            for name in &param_names {
                fn_ctx.declared_vars.insert(name.clone());
            }

            let (fn_body_stmts, fn_return_expr) = compile_expression(func_body, &mut fn_ctx)?;

            // Save nested function info before propagation (needed for factory instance rewriting)
            let nested_fns: Vec<(String, Vec<String>, String)> = fn_ctx.generated_functions.clone();
            let nested_parents: std::collections::HashMap<String, String> = fn_ctx.nested_function_parent.clone();

            // Propagate nested function definitions from fn_ctx to parent ctx
            for item in fn_ctx.generated_functions {
                ctx.generated_functions.push(item);
            }
            for item in fn_ctx.generated_structs {
                ctx.generated_structs.push(item);
            }
            for (k, v) in fn_ctx.function_return_types {
                ctx.function_return_types.insert(k, v);
            }
            for item in fn_ctx.generated_function_instantiations {
                ctx.generated_function_instantiations.insert(item);
            }
            // Propagate captured vars from nested functions (e.g., inner fn modifying outer mut)
            for item in fn_ctx.captured_vars {
                ctx.captured_vars.insert(item);
            }
            // Propagate nested_function_parent from child context
            for (k, v) in fn_ctx.nested_function_parent {
                ctx.nested_function_parent.insert(k, v);
            }

            // Track parent-child relationships: only direct children (not already a child of another nested function)
            for (child_name, _, _) in &nested_fns {
                // Only set parent if not already set (preserves deeper nesting like get -> Inner)
                ctx.nested_function_parent.entry(child_name.clone())
                    .or_insert_with(|| func_name.clone());
            }

            // Detect captured outer variables: any outer declared var that appears
            // in the function body (and isn't a parameter) needs to be a static global.
            for var in &ctx.declared_vars {
                if !param_names.contains(var) && func_body.contains(var.as_str()) {
                    eprintln!("[fn_handler] captured outer var: '{}'", var);
                    ctx.captured_vars.insert(var.clone());
                }
            }

            // Detect if function returns `this` - generate struct with local vars as fields.
            // Strip the outer braces and check whether the trailing expression is the
            // bare word "this" - whitespace-agnostic (source may format "this" on its
            // own line rather than as "... this }" on one line).
            let func_body_trimmed = func_body.trim();
            let returns_this = {
                let mut inner = func_body_trimmed;
                if let Some(s) = inner.strip_prefix('{') {
                    inner = s;
                }
                if let Some(s) = inner.strip_suffix('}') {
                    inner = s;
                }
                let inner = inner.trim();
                inner == "this"
                    || (inner.ends_with("this")
                        && inner[..inner.len() - "this".len()]
                            .chars()
                            .next_back()
                            .map(|c| !c.is_alphanumeric() && c != '_')
                            .unwrap_or(true))
            };

            let c_func = if return_type.as_deref() == Some("Void") || fn_return_expr.is_empty() {
                build_c_function_with_return_type(
                    &func_name,
                    &param_names,
                    &fn_read_entries,
                    &fn_body_stmts,
                    "",
                    "void",
                    None,
                )
            } else if returns_this {
                // Collect local variables (declared in fn minus params minus outer vars)
                let mut local_vars: Vec<String> = fn_ctx.declared_vars
                    .iter()
                    .filter(|v| {
                        !param_names.contains(*v)
                            && !ctx.declared_vars.contains(*v)
                    })
                    .cloned()
                    .collect();
                local_vars.sort(); // deterministic order

                let ret_struct = format!("{}_ret", func_name);
                // Generate struct typedef
                let fields_str = local_vars.iter()
                    .map(|v| format!("\tint {};", v))
                    .collect::<Vec<_>>()
                    .join("\n");
                let typedef = format!("typedef struct {{\n{}\n}} {};", fields_str, ret_struct);
                ctx.generated_structs.push(typedef);

                // Build struct initializer: (StructName){.field1 = field1, .field2 = field2}
                let init_fields = local_vars.iter()
                    .map(|v| format!(".{} = {}", v, v))
                    .collect::<Vec<_>>()
                    .join(", ");
                let struct_init = format!("({}){{{}}}", ret_struct, init_fields);

                // Register direct child methods for dot-notation calling.
                // Only direct children become methods (not grandchildren).
                // For methods that capture factory local vars, they need instance->var access.
                // For nested factories (returns_this), they remain standalone but are registered
                // so dot notation knows to pass the instance pointer.
                for (method_name, method_params, method_code) in &nested_fns {
                    if method_code.is_empty() { continue; }
                    // Only register direct children - skip functions that have their own parent
                    let is_direct_child = !nested_parents.contains_key(method_name);
                    if !is_direct_child { continue; }
                    // Register this method as needing an instance pointer
                    ctx.factory_method_instances.insert(method_name.clone(), ret_struct.clone());
                    // If method captures factory local vars, rewrite it to use instance->var
                    let captures_factory_var = local_vars.iter().any(|v| method_code.contains(v.as_str()));
                    if captures_factory_var {
                        // Rewrite the C code: add instance param and replace var -> instance->var
                        let mut rewritten = method_code.clone();
                        // Build C-typed param signatures (params are raw names like "bar", need "int bar")
                        let c_params: Vec<String> = method_params.iter().map(|p| format!("int {}", p)).collect();
                        // Replace function signature with instance pointer parameter
                        for ret_type in &["void", "int"] {
                            let old_sig = if method_params.is_empty() {
                                format!("{} {}(void)", ret_type, method_name)
                            } else {
                                format!("{} {}({})", ret_type, method_name, c_params.join(", "))
                            };
                            let new_sig = if method_params.is_empty() {
                                format!("{} {}({}* instance)", ret_type, method_name, ret_struct)
                            } else {
                                format!("{} {}({}* instance, {})", ret_type, method_name, ret_struct, c_params.join(", "))
                            };
                            if rewritten.contains(&old_sig) {
                                rewritten = rewritten.replace(&old_sig, &new_sig);
                            }
                        }
                        // Replace captured var references with instance->var
                        for var in &local_vars {
                            let from = format!("{} ", var);
                            let to = format!("instance->{} ", var);
                            rewritten = rewritten.replace(&from, &to);
                            let from = format!("{};", var);
                            let to = format!("instance->{};", var);
                            rewritten = rewritten.replace(&from, &to);
                            let from = format!("{}}}", var);
                            let to = format!("instance->{}}}", var);
                            rewritten = rewritten.replace(&from, &to);
                            let from = format!("{}\n", var);
                            let to = format!("instance->{}\n", var);
                            rewritten = rewritten.replace(&from, &to);
                        }
                        // Build new param list: instance pointer + original params
                        let mut new_params: Vec<String> = vec![format!("{}* instance", ret_struct)];
                        for p in method_params {
                            let raw_name = p.split_whitespace().last().unwrap_or(p);
                            new_params.push(raw_name.to_string());
                        }
                        // Replace in generated_functions
                        ctx.generated_functions.retain(|(n, _, _)| n != method_name);
                        ctx.generated_functions.push((method_name.clone(), new_params, rewritten));
                    }
                }
                // Remove factory local vars from captured_vars — they're now per-instance
                for var in &local_vars {
                    ctx.captured_vars.remove(var);
                }

                build_c_function_with_return_type(
                    &func_name,
                    &param_names,
                    &fn_read_entries,
                    &fn_body_stmts,
                    &struct_init,
                    &ret_struct,
                    None,
                )
            } else {
                build_c_function(
                    &func_name,
                    &param_names,
                    &fn_read_entries,
                    &fn_body_stmts,
                    &fn_return_expr,
                )
            };
            ctx.generated_functions
                .push((func_name.clone(), param_names, c_func));
            if let Some(ref ret) = return_type {
                ctx.function_return_types.insert(func_name, ret.clone());
            } else if fn_return_expr.is_empty() {
                // Function with no return expression is implicitly Void
                ctx.function_return_types.insert(func_name, "Void".to_string());
            } else if returns_this {
                ctx.function_return_types.insert(func_name.clone(), format!("{}_ret", func_name));
            }

            // Compile remaining expression after the function definition
            if !remaining.is_empty() {
                return compile_expression(remaining, ctx);
            }

            return Ok((String::new(), String::new()));
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
                for field in split_top_level_commas(fields_str) {
                    let field = field.trim();
                    if field.is_empty() {
                        continue;
                    }
                    let parts: Vec<&str> = field.split(':').collect();
                    let name = parts[0].trim().to_string();
                    if name.is_empty() {
                        continue;
                    }
                    // Check for duplicate field names
                    if !seen_fields.insert(name.clone()) {
                        return Err(format!("Duplicate struct field: {}", name));
                    }
                    // Determine field type from annotation (type is required)
                    let field_type_str: String = if parts.len() > 1 {
                        let ty = parts[1].trim();
                        // Validate type is known
                        if !is_valid_type(ctx, ty) {
                            let known = get_known_types(ctx);
                            let known_list = if known.is_empty() {
                                "(none)".to_string()
                            } else {
                                format!("{}", known.join(", "))
                            };
                            return Err(format!("Unknown type: {} (accessible types: {})", ty, known_list));
                        }
                        // Handle generic struct instantiations: "Wrapper<I32>" -> "Wrapper_I32"
                        if let Some((base, type_args)) = parse_generic_type_args(ty) {
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
        // Strip leading semicolons; keep trailing semicolons for let/assignment handlers
        let rest = rest.trim_start_matches(';').trim();
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
        // Use parse_generic_type to handle nested generics like "Wrapper<Pair<I32, Bool>>"
        let (struct_base, type_args) = if let Some((base, args_str)) = parse_generic_type(before_brace) {
            let args: Vec<String> = split_top_level_commas(args_str)
                .iter()
                .map(|a| a.trim().to_string())
                .collect();
            (base.to_string(), args)
        } else {
            (before_brace.to_string(), Vec::new())
        };

        // Must be a single identifier (no spaces)
        if !struct_base.contains(' ') {
            // Build concrete name using sanitized type args for valid C identifiers
            let concrete_name = if type_args.is_empty() {
                struct_base.clone()
            } else {
                let sanitized: Vec<String> = type_args.iter().map(|a| sanitize_type_name(a)).collect();
                format!("{}_{}", struct_base, sanitized.join("_"))
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
                        for field in split_top_level_commas(fields_str) {
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

    // Handle "as" type cast: "expr as Type" => C cast expression
    if let Some(as_pos) = find_top_level_keyword(trimmed, " as ") {
        let lhs = trimmed[..as_pos].trim();
        let target_type = trimmed[as_pos + 4..].trim(); // skip " as "
        let (_, lhs_result) = compile_expression(lhs, ctx)?;
        let c_type = tuff_type_to_c(ctx, target_type)?;
        return Ok((String::new(), format!("(({})({}))", c_type, lhs_result)));
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
        // Check if LHS is an "as" cast expression - extract target type
        // Strip outer parens first to find "as" inside
        let lhs_unwrapped = if lhs.starts_with('(') && lhs.ends_with(')') {
            if let Some(paren_end) = find_matching_paren(&lhs) {
                lhs[1..paren_end].trim()
            } else {
            &lhs
            }
        } else {
            &lhs
        };
        let lhs_types: Vec<String> = if let Some(as_pos) = find_top_level_keyword(lhs_unwrapped, " as ") {
            let cast_type = lhs_unwrapped[as_pos + 4..].trim().to_string();
            vec![cast_type]
        } else if let Some(var_types) = ctx.var_types.get(&lhs) {
            // Resolve each type through aliases
            let mut resolved = Vec::new();
            for ty in var_types {
                resolved.extend(resolve_type_alias_set(ctx, ty));
            }
            resolved
        } else if lhs_unwrapped.starts_with("sizeOf<") && lhs_unwrapped.ends_with(">()") {
            vec!["USize".to_string()]
        } else if let Some(paren_pos) = lhs_unwrapped.find('(') {
            // Function call: look up return type
            let fn_name = lhs_unwrapped[..paren_pos].trim();
            if let Some(ret_type) = ctx.function_return_types.get(fn_name) {
                vec![ret_type.clone()]
            } else {
                vec![infer_literal_type(&lhs)]
            }
        } else {
            vec![infer_literal_type(&lhs)]
        };
        // Resolve check type through aliases
        let mut check_types = resolve_type_alias_set(ctx, &check_type);
        // If check type is a function name, also include its return type
        if let Some(fn_ret) = ctx.function_return_types.get(&check_type) {
            check_types.push(fn_ret.clone());
        }
        // Check if any LHS type matches any check type
        let matched = lhs_types
            .iter()
            .any(|lt| check_types.iter().any(|ct| lt == ct));
        let result = if matched { "1" } else { "0" };
        return Ok((String::new(), String::from(result)));
    }

    // Handle ".length" property access
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
        // Check if base is a function call with an array return type (handles generic calls too)
        if let Some(return_type) = get_function_call_return_type(ctx, base_expr) {
            if let Some(size) = parse_array_size(&return_type) {
                let (_, base_result) = compile_expression(base_expr, ctx)?;
                return Ok((String::new(), format!("((void){} , {})", base_result, size)));
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

    // Handle "&" (address-of) operator: "&expr" => "&expr"
    if trimmed.starts_with('&') && !trimmed.starts_with("&Str") {
        let inner = trimmed[1..].trim_start();
        // Only treat as address-of if it's followed by an identifier (variable name)
        if inner.chars().next().map(|c| c.is_alphabetic() || c == '_').unwrap_or(false) {
            let (_, inner_result) = compile_expression(inner, ctx)?;
            return Ok((String::new(), format!("&{}", inner_result)));
        }
    }

    // Handle "*" (dereference) operator: "*expr" => "(*expr)"
    if trimmed.starts_with('*') {
        let (_, inner_result) = compile_expression(&trimmed[1..], ctx)?;
        return Ok((String::new(), format!("(*{})", inner_result)));
    }

    // Handle array literal as expression: "[1, 2, 3]" or "[value; count]"
    if trimmed.starts_with('[') && trimmed.ends_with(']') {
        // Check for array repeat syntax: [value; count]
        if let Ok((val_body, c_init)) = compile_array_repeat_expr(trimmed, ctx) {
            return Ok((val_body, c_init));
        }
        // Regular array literal: [a, b, c]
        if let Some((items, _closing_bracket)) = parse_array_items(trimmed) {
            let mut c_body = String::new();
            let mut compiled_items = Vec::new();
            for item in &items {
                let (item_body, item_result) = compile_expression(item, ctx)?;
                c_body.push_str(&item_body);
                compiled_items.push(item_result);
            }
            let c_init = format!("{{{}}}", compiled_items.join(", "));
            return Ok((c_body, c_init));
        }
    }

    // Handle tuple literal: "(a, b)" where commas exist at top level inside parens.
    // Distinguish from parenthesized expression: "(a + b)" has no top-level comma.
    if let Some(tuple_elements) = parse_tuple_literal(trimmed) {
        let mut c_body = String::new();
        let mut compiled_elements = Vec::new();
        for elem in &tuple_elements {
            let (elem_body, elem_result) = compile_expression(elem, ctx)?;
            c_body.push_str(&elem_body);
            compiled_elements.push(elem_result);
        }
        let fields_str = compiled_elements
            .iter()
            .enumerate()
            .map(|(i, v)| format!(".f{} = {}", i, v))
            .collect::<Vec<_>>()
            .join(", ");
        let tuple_type = format!("({})", tuple_elements
            .iter()
            .map(|e| infer_literal_type(e))
            .collect::<Vec<_>>()
            .join(", "));
        let tuple_name = tuff_type_to_c(ctx, &tuple_type)?;
        let c_init = format!("({}){{{}}}", tuple_name, fields_str);
        return Ok((c_body, c_init));
    }

    // Handle "this.x" - access variable x from current scope
    if let Some(field) = trimmed.strip_prefix("this.") {
        let var_name = field.split(|c: char| !c.is_alphanumeric() && c != '_').next().unwrap_or(field);
        if ctx.declared_vars.contains(var_name) {
            return Ok((String::new(), var_name.to_string()));
        }
        return Err(format!("Variable '{}' not found in scope", var_name));
    }

    // Handle "this" as a standalone expression
    if trimmed == "this" {
        return Ok((String::new(), "0".to_string()));
    }

    // Handle field access on this-refs: "temp.x" where temp is a this-ref -> just "x"
    if let Some(dot_pos) = trimmed.find('.') {
        let base = &trimmed[..dot_pos].trim();
        let field = &trimmed[dot_pos + 1..].trim();
        let base_str = base.to_string();
        let field_str = field.to_string();
        if ctx.this_refs.contains(&base_str) && (ctx.declared_vars.contains(&field_str) || ctx.captured_vars.contains(&field_str)) {
            return Ok((String::new(), field.to_string()));
        }
        // Handle method call on this-returning function result: "Factory().get()" -> "get()"
        // Extract the method name (strip trailing parens if present)
        let method_name = if let Some(paren_pos) = field_str.find('(') {
            &field_str[..paren_pos]
        } else {
            &field_str
        };
        // Check if method_name is a known generated function (nested method)
        if ctx.generated_functions.iter().any(|(name, _, _)| name == method_name) {
            // Determine if this method needs an instance pointer
            let needs_instance = ctx.factory_method_instances.contains_key(method_name)
                || (ctx.nested_function_parent.contains_key(method_name)
                    && ctx.function_return_types.get(method_name)
                        .map(|ret| ret == &format!("{}_ret", method_name))
                        .unwrap_or(false));
            if needs_instance {
                // Check if this method actually accepts an instance pointer (was rewritten)
                // by looking at the generated function's params
                let method_accepts_instance = ctx.generated_functions.iter()
                    .find(|(name, _, _)| name == method_name)
                    .map(|(_, params, _)| params.first().map(|p| p.contains('*')).unwrap_or(false))
                    .unwrap_or(false);

                // If base is an rvalue (e.g., "a()"), introduce a temp variable
                let (base_temp_decl, instance_ref) = if base_str.contains('(') {
                    let temp_name = "_tmp";
                    let fn_name = &base_str[..base_str.find('(').unwrap_or(0)];
                    let ret_type = ctx.function_return_types.get(fn_name)
                        .map(|t| t.as_str())
                        .unwrap_or("a_ret");
                    (format!("\t{} {} = {};\n", ret_type, temp_name, base_str), String::from(temp_name))
                } else {
                    (String::new(), base_str.to_string())
                };

                // Extract method call from after_dot: "method(args)" or "method"
                let after_dot = &trimmed[dot_pos + 1..].trim();
                let method_call_str: &str;
                let remaining_chain: &str;
                if let Some(paren_pos) = after_dot.find('(') {
                    let from_paren = &after_dot[paren_pos..];
                    if let Some(paren_end) = find_matching_paren(from_paren) {
                        method_call_str = &from_paren[..paren_end + 1];
                        remaining_chain = from_paren[paren_end + 1..].trim_start();
                    } else {
                        method_call_str = after_dot;
                        remaining_chain = "";
                    }
                } else {
                    method_call_str = after_dot;
                    remaining_chain = "";
                };

                // Extract args from method_call_str
                let args_str: &str = if let Some(paren_pos) = method_call_str.find('(') {
                    let from_paren = &method_call_str[paren_pos + 1..];
                    if let Some(close) = from_paren.find(')') {
                        &from_paren[..close]
                    } else {
                        ""
                    }
                } else {
                    ""
                };

                // Compile args
                let (args_body, args_result) = if !args_str.is_empty() {
                    compile_expression(args_str.trim(), ctx)?
                } else {
                    (String::new(), String::new())
                };

                // Build method call - only pass instance if method accepts it
                let method_call = if method_accepts_instance {
                    if args_result.is_empty() {
                        format!("{}(&{})", method_name, instance_ref)
                    } else {
                        format!("{}(&{}, {})", method_name, instance_ref, args_result)
                    }
                } else {
                    // Nested factory called via dot notation - just call it normally
                    if args_result.is_empty() {
                        format!("{}()", method_name)
                    } else {
                        format!("{}({})", method_name, args_result)
                    }
                };

                // Handle remaining chain
                if !remaining_chain.is_empty() {
                    // Store method result in temp for remaining chain
                    let ret_type = ctx.function_return_types.get(method_name)
                        .map(|t| t.as_str())
                        .unwrap_or("int");
                    let call_temp = "_call_tmp";
                    let call_temp_decl = format!("\t{} {} = {};\n", ret_type, call_temp, method_call);
                    let remaining_expr = format!("{}{}", call_temp, remaining_chain);
                    let (chain_body, chain_result) = compile_expression(&remaining_expr, ctx)?;
                    let combined_body = format!("{}{}{}{}", base_temp_decl, args_body, call_temp_decl, chain_body);
                    return Ok((combined_body, chain_result));
                } else {
                    let combined_body = format!("{}{}", base_temp_decl, args_body);
                    return Ok((combined_body, method_call));
                }
            }
            // It's a method call — compile as a plain function call
            let after_dot = &trimmed[dot_pos + 1..].trim();
            return compile_expression(after_dot, ctx);
        }
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
        let mut chars = s.chars().peekable();
        while let Some(ch) = chars.next() {
            match ch {
                '{' => out.push('('),
                '}' => out.push(')'),
                '.' => {
                    out.push('.');
                    // Check if next char is a digit (tuple field access: .0 -> .f0)
                    if let Some(&next_ch) = chars.peek() {
                        if next_ch.is_ascii_digit() {
                            out.push('f');
                            out.push(next_ch);
                            chars.next(); // consume the digit
                        }
                    }
                }
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

    // Third pass: handle sizeOf<T>() -> sizeof(C_type)
    let mut sizeof_result = String::new();
    let mut sizeof_last = 0;
    for m in result.match_indices("sizeOf<") {
        copy_chars(&result[sizeof_last..m.0], &mut sizeof_result);
        let rest = &result[m.0 + m.1.len()..]; // after "sizeOf<"
        if let Some(end_pos) = rest.find(">()") {
            let type_arg = rest[..end_pos].trim();
            // Resolve type: extern type -> use as-is, Tuff type -> convert to C
            let c_type = if ctx.extern_types.contains(type_arg) {
                type_arg.to_string()
            } else {
                tuff_type_to_c(ctx, type_arg).unwrap_or_else(|_| type_arg.to_string())
            };
            sizeof_result.push_str(&format!("sizeof({})", c_type));
            sizeof_last = m.0 + m.1.len() + end_pos + ">()".len();
        } else {
            // Fallback: copy literally
            for ch in result[m.0..].chars() {
                sizeof_result.push(ch);
            }
            sizeof_last = result.len();
        }
    }
    copy_chars(&result[sizeof_last..], &mut sizeof_result);
    result = sizeof_result;

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
        // If no explicit type args, try to infer from argument count for rest-parameter functions
        let effective_type_args = if call_type_args.is_empty() {
            // Check if this is a generic function with rest params - infer L from arg count
            if let Some(template) = ctx.generic_functions.iter().find(|t| t.name == call_name) {
                // Count arguments in the call
                if let Some(paren_end_opt) = find_matching_paren(&final_result[m.0..]) {
                    let args_str = &final_result[m.0 + 1..m.0 + paren_end_opt].trim();
                    let arg_count = if args_str.is_empty() { 0 } else { args_str.split(',').count() };
                    infer_rest_param_types(template, arg_count)
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            Some(call_type_args.clone())
        };

        let resolved_name = if let Some(effective_args) = effective_type_args {
            if let Some(template) = ctx.generic_functions.iter().find(|t| t.name == call_name) {
                let concrete_name = format!("{}_{}", call_name, effective_args.join("_"));
                if !ctx
                    .generated_function_instantiations
                    .contains(&concrete_name)
                {
                    // Substitute type parameters in the function body
                    let mut substituted_body = template.body.clone();
                    for (type_param, concrete_type) in template.type_params.iter().zip(effective_args.iter()) {
                        substituted_body = substituted_body.replace(type_param, concrete_type);
                    }

                    // Handle rest parameters: expand ...args to individual params
                    let mut all_param_names = template.param_names.clone();
                    let mut rest_param_replacements: Vec<(String, String)> = Vec::new(); // (rest_name, array_literal)
                    for (rest_name, _rest_type) in &template.rest_params {
                        // Infer array size from rest type if it contains a type param
                        let rest_type = _rest_type;
                        let array_size = if rest_type.starts_with('[') {
                            // Try to extract size from type, e.g., "[I32; L]" -> look for L in type_params
                            if let Some(semi_pos) = rest_type.find(';') {
                                let size_str = rest_type[semi_pos + 1..].trim().trim_end_matches(']');
                                // Check if size_str is a type param that needs substitution
                                let mut resolved_size = size_str.to_string();
                                for (type_param, concrete_type) in template.type_params.iter().zip(effective_args.iter()) {
                                    resolved_size = resolved_size.replace(type_param, concrete_type);
                                }
                                // resolved_size is now just the number (e.g., "3"), parse directly
                                resolved_size.parse().unwrap_or(0)
                            } else {
                                0
                            }
                        } else {
                            0
                        };
                        let expanded_params: Vec<String> = (0..array_size)
                            .map(|i| format!("{}{}", rest_name, i))
                            .collect();
                        all_param_names.extend(expanded_params.clone());
                        let array_literal = format!("[{}]", expanded_params.join(", "));
                        rest_param_replacements.push((rest_name.clone(), array_literal));
                    }

                    // Replace rest param names in body with array literals
                    for (rest_name, array_literal) in &rest_param_replacements {
                        substituted_body = substituted_body.replace(rest_name, array_literal);
                    }

                    let fn_read_entries = find_reads_in_order(&substituted_body);
                    let mut fn_ctx = CompileContext::new(
                        (0..fn_read_entries.len())
                            .map(|i| format!("v{}", i))
                            .collect(),
                    );
                    for name in &all_param_names {
                        fn_ctx.declared_vars.insert(name.clone());
                    }
                    let (fn_body_stmts, fn_return_expr) =
                        compile_expression(&substituted_body, &mut fn_ctx)?;
                    let c_func = build_c_function(
                        &concrete_name,
                        &all_param_names,
                        &fn_read_entries,
                        &fn_body_stmts,
                        &fn_return_expr,
                    );
                    // Check if return type is an array - need struct wrapper for C
                    let is_array_return = if let Some(ref ret_type) = template.return_type {
                        let mut concrete_ret = ret_type.clone();
                        for (type_param, concrete_type) in template.type_params.iter().zip(effective_args.iter()) {
                            concrete_ret = concrete_ret.replace(type_param, concrete_type);
                        }
                        ctx.function_return_types.insert(concrete_name.clone(), concrete_ret.clone());
                        concrete_ret.starts_with('[')
                    } else {
                        false
                    };
                    let c_func = if is_array_return {
                        let size = parse_array_size(&ctx.function_return_types[&concrete_name]).unwrap_or(1);
                        build_c_function_with_return_type(
                            &concrete_name,
                            &all_param_names,
                            &fn_read_entries,
                            &fn_body_stmts,
                            &fn_return_expr,
                            &format!("{}_ret", concrete_name),
                            Some(size),
                        )
                    } else {
                        c_func
                    };
                    ctx.generated_functions.push((
                        concrete_name.clone(),
                        all_param_names,
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
        } else if ctx.extern_functions.contains_key(&call_name) {
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
    eprintln!("[find_matching_brace] input='{}' starts_with_brace={}", s, s.starts_with('{'));
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
                    eprintln!("[find_matching_brace] found matching '}}' at index {}", i);
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    eprintln!("[find_matching_brace] no matching '}}' found");
    None
}

/// Infer the type of a literal expression based on its suffix.
/// "100I64" -> "I64", "100U8" -> "U8", "\"hello\"" -> "&Str", "100" -> "I32"
fn infer_literal_type(expr: &str) -> String {
    let trimmed = expr.trim();
    // sizeOf<T>() always returns USize
    if trimmed.starts_with("sizeOf<") && trimmed.ends_with(">()") {
        return "USize".to_string();
    }
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
    // Struct instantiation: "Pair<I32, Bool> { ... }" -> "Pair<I32, Bool>"
    if let Some(brace_pos) = trimmed.find('{') {
        let before_brace = trimmed[..brace_pos].trim();
        // If it looks like a generic struct instantiation, return the type
        if let Some(_angle_start) = before_brace.find('<') {
            if let Some(angle_end) = before_brace.find('>') {
                return before_brace[..angle_end + 1].to_string();
            }
        }
        // Non-generic struct: "Point { ... }" -> "Point"
        if !before_brace.contains(' ') {
            return before_brace.to_string();
        }
    }
    "I32".to_string()
}

/// Collect all accessible user-defined type names (structs, aliases, unions, extern types).
fn get_known_types(ctx: &CompileContext) -> Vec<String> {
    let mut types = Vec::new();
    for s in &ctx.defined_structs {
        types.push(s.clone());
    }
    for (alias, members) in &ctx.type_aliases {
        if members.len() == 1 {
            types.push(alias.clone());
        } else {
            types.push(format!("{} (union of {})", alias, members.join(", ")));
        }
    }
    for union_name in ctx.union_types.keys() {
        types.push(union_name.clone());
    }
    for ext_type in &ctx.extern_types {
        types.push(ext_type.clone());
    }
    types.sort();
    types
}

/// Check if a type name is a known built-in type or a defined struct/alias.
/// Handles generic types like `Wrapper<I32>` by extracting the base name.
fn is_valid_type(ctx: &CompileContext, ty: &str) -> bool {
    // Handle pointer types: "&I32", "&[I32; 3]", etc.
    if let Some(inner) = ty.strip_prefix('&') {
        let inner_trimmed = inner.trim();
        if inner_trimmed == "Str" {
            return true; // &Str is valid
        }
        // Check if inner type is valid (recursive for nested pointers)
        if inner_trimmed.starts_with('[') {
            // Array type like "[I32; 3]"
            if let Some(semi_pos) = inner_trimmed.find(';') {
                let elem_type = inner_trimmed[1..semi_pos].trim();
                return is_valid_type(ctx, elem_type);
            }
        }
        return is_valid_type(ctx, inner_trimmed);
    }
    matches!(ty, "I8" | "I16" | "I32" | "I64" | "U8" | "U16" | "U32" | "U64" | "USize" | "Bool" | "Void")
        || ctx.defined_structs.contains(ty)
        || ctx.type_aliases.contains_key(ty)
        || ctx.union_types.contains_key(ty)
        || ctx.function_return_types.contains_key(ty)
        || {
            // Handle generic types like "Wrapper<I32>" — extract base name
            if let Some(angle_start) = ty.find('<') {
                let base = &ty[..angle_start];
                ctx.defined_structs.contains(base)
            } else {
                false
            }
        }
        || {
            // Handle tuple types like "(I32, I32)"
            let inner = ty.trim();
            inner.starts_with('(') && inner.ends_with(')')
        }
}

/// Check if a return expression is a call to a Void-returning function.
fn is_void_return(expr: &str, ctx: &CompileContext) -> bool {
    let trimmed = expr.trim();
    if let Some(paren_pos) = trimmed.find('(') {
        let call_name = trimmed[..paren_pos].trim();
        if let Some((_params, _ptypes, ret_type)) = ctx.extern_functions.get(call_name) {
            return ret_type == "Void";
        }
    }
    false
}

/// Resolve the final return expression, handling empty and Void cases.
fn resolve_final_return(return_expr: &str, ctx: &CompileContext) -> String {
    if return_expr.is_empty() {
        "0".to_string()
    } else if is_void_return(return_expr, ctx) {
        "0".to_string()
    } else {
        return_expr.to_string()
    }
}

/// Map a Tuff type name to its corresponding C type.
/// Returns an error for unknown types instead of defaulting to "int".
fn tuff_type_to_c(ctx: &mut CompileContext, ty: &str) -> Result<String, CompileError> {
    // Pointer types: "&I32" -> "int *", "&[I32; 3]" -> "int *"
    if let Some(inner_type) = ty.strip_prefix('&') {
        let inner_trimmed = inner_type.trim();
        // Skip &Str — handled below as built-in
        if inner_trimmed == "Str" {
            return Ok("const char *".to_string());
        }
        // Pointer to array: "&[I32; 3]" -> element pointer "int *"
        if inner_trimmed.starts_with('[') && inner_trimmed.ends_with(']') {
            let inner = &inner_trimmed[1..inner_trimmed.len() - 1];
            if let Some(semi_pos) = inner.find(';') {
                let elem_type = inner[..semi_pos].trim();
                let elem_c = tuff_type_to_c(ctx, elem_type)?;
                return Ok(format!("{} *", elem_c));
            }
        }
        let inner_c = tuff_type_to_c(ctx, inner_trimmed)?;
        return Ok(format!("{} *", inner_c));
    }
    // Built-in types
    match ty {
        "I8" => return Ok("signed char".to_string()),
        "I16" => return Ok("short".to_string()),
        "I32" => return Ok("int".to_string()),
        "I64" => return Ok("long long".to_string()),
        "U8" => return Ok("unsigned char".to_string()),
        "U16" => return Ok("unsigned short".to_string()),
        "U32" => return Ok("unsigned int".to_string()),
        "U64" => return Ok("unsigned long long".to_string()),
        "USize" => return Ok("size_t".to_string()),
        "&Str" => return Ok("const char *".to_string()),
        "Bool" => return Ok("int".to_string()),
        _ => {}
    }
    // User-defined struct (typedef name used as-is)
    if ctx.defined_structs.contains(ty) {
        return Ok(ty.to_string());
    }
    // Function returning `this` — the function name is a type alias for the return struct
    if let Some(ret_type) = ctx.function_return_types.get(ty) {
        return Ok(ret_type.clone());
    }
    // Type alias — resolve and recurse
    if let Some(members) = ctx.type_aliases.get(ty) {
        if members.len() == 1 {
            let member = members[0].clone();
            return tuff_type_to_c(ctx, &member);
        }
        // Union alias — return first member's C type (or error if empty)
        if let Some(first) = members.first() {
            let member = first.clone();
            return tuff_type_to_c(ctx, &member);
        }
    }
    // Union type — resolve to underlying types
    if let Some(variants) = ctx.union_types.get(ty) {
        if let Some(first) = variants.first() {
            let member = first.clone();
            return tuff_type_to_c(ctx, &member);
        }
    }
    // Generic struct instantiation: "Wrapper<I32>" -> build concrete C name
    if let Some((base, type_args)) = parse_generic_type_args(ty) {
        let type_args_refs: Vec<&str> = type_args.iter().map(|s| *s).collect();
        return monomorphize_generic_struct(ctx, base, &type_args_refs);
    }
    // Tuple type: "(I32, I32)" -> generate C struct typedef and return type name
    if let Some(elements) = parse_tuple_type(ty) {
        eprintln!("[tuff_type_to_c] tuple type: '{}', elements: {:?}", ty, elements);
        let sanitized: Vec<String> = elements.iter().map(|e| {
            let result = sanitize_type_name(e);
            eprintln!("[tuff_type_to_c] sanitize_type_name('{}') -> '{}'", e, result);
            result
        }).collect();
        eprintln!("[tuff_type_to_c] tuple_name: '__Tuple_{}'", sanitized.join("_"));
        let tuple_name = format!("__Tuple_{}", sanitized.join("_"));
        if !ctx.defined_structs.contains(&tuple_name) {
            let mut fields = String::new();
            for (i, elem) in elements.iter().enumerate() {
                let c_type = tuff_type_to_c(ctx, elem)?;
                fields.push_str(&format!("\t\t{} f{};\n", c_type, i));
            }
            let mut typedef = "typedef struct {\n".to_string();
            typedef.push_str(&fields);
            typedef.push_str("} ");
            typedef.push_str(&tuple_name);
            typedef.push(';');
            ctx.generated_structs.push(typedef);
            ctx.defined_structs.insert(tuple_name.clone());
        }
        return Ok(tuple_name);
    }
    // Array type: "[I32; 3]" -> "int" (arrays decay to pointers in C)
    if ty.starts_with('[') && ty.ends_with(']') {
        let inner = &ty[1..ty.len() - 1];
        if let Some(semi_pos) = inner.find(';') {
            let elem_type = inner[..semi_pos].trim();
            return tuff_type_to_c(ctx, elem_type);
        }
        // Variable-length array without size: "[I32]" -> element type
        return tuff_type_to_c(ctx, inner.trim());
    }
    let known = get_known_types(ctx);
    let known_list = if known.is_empty() {
        "(none)".to_string()
    } else {
        format!("{}", known.join(", "))
    };
    Err(format!("Unknown type: {} (accessible types: {})", ty, known_list))
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
/// Handles nested generics: "Pair<I32, Bool>" -> "Pair_I32_Bool".
fn sanitize_type_name(ty: &str) -> String {
    // Check tuple types first - "(I32, Pair<I32, Bool>)" must be handled before
    // parse_generic_type finds the '<' inside the tuple and treats "(I32, Pair" as a base.
    if let Some(tuple_types) = parse_tuple_type(ty) {
        let sanitized_elements: Vec<String> = tuple_types
            .iter()
            .map(|e| sanitize_type_name(e.trim()))
            .collect();
        format!("Tuple_{}", sanitized_elements.join("_"))
    } else if let Some((base, type_args_str)) = parse_generic_type(ty) {
        let sanitized_args: Vec<String> = split_top_level_commas(type_args_str)
            .iter()
            .map(|a| sanitize_type_name(a.trim()))
            .collect();
        format!("{}_{}", sanitize_type_name(base), sanitized_args.join("_"))
    } else {
        ty.replace('&', "").replace(' ', "_")
    }
}

/// Parse a generic type and split type args at top-level commas.
/// Returns (base_name, vec_of_trimmed_type_args) or None if not generic.
fn parse_generic_type_args(ty: &str) -> Option<(&str, Vec<&str>)> {
    if let Some((base, type_args_str)) = parse_generic_type(ty) {
        let type_args: Vec<&str> = split_top_level_commas(type_args_str).iter().map(|a| a.trim()).collect();
        Some((base, type_args))
    } else {
        None
    }
}

/// Parse a tuple literal like "(a, b)" into its element strings.
/// Returns None if not a tuple (single element or no top-level commas).
fn parse_tuple_literal(s: &str) -> Option<Vec<&str>> {
    let trimmed = s.trim();
    if trimmed.starts_with('(') && trimmed.ends_with(')') {
        let inner = &trimmed[1..trimmed.len() - 1];
        let elements: Vec<&str> = split_top_level_commas(inner)
            .iter()
            .map(|e| e.trim())
            .collect();
        if elements.len() >= 2 {
            Some(elements)
        } else {
            None
        }
    } else {
        None
    }
}

/// Parse a tuple type annotation like "(I32, I32)" into its element type strings.
/// Returns None if not a tuple type.
fn parse_tuple_type(ty: &str) -> Option<Vec<&str>> {
    let inner = ty.trim();
    if inner.starts_with('(') && inner.ends_with(')') {
        let content = &inner[1..inner.len() - 1];
        let elements: Vec<&str> = split_top_level_commas(content)
            .iter()
            .map(|e| e.trim())
            .collect();
        if elements.len() >= 2 {
            Some(elements)
        } else {
            None
        }
    } else {
        None
    }
}

/// Build a concrete type name from a base and type args string.
/// "Wrapper", "I32" -> "Wrapper_I32"
/// "Wrapper", "I32, Bool" -> "Wrapper_I32_Bool"
/// "Wrapper", "&Str" -> "Wrapper_Str"
fn build_concrete_name(base: &str, type_args_str: &str) -> String {
    let type_args: Vec<String> = split_top_level_commas(type_args_str).iter().map(|a| sanitize_type_name(a.trim())).collect();
    format!("{}_{}", base, type_args.join("_"))
}

/// Parse a generic type annotation like "Wrapper<I32>" into (base, type_args_str).
/// Handles nested generics like "Wrapper<Pair<I32, Bool>>" by finding the matching ">".
/// Returns None if the type is not generic.
/// Skips '<' that are inside parentheses (tuple types) to avoid matching
/// "(I32, Pair<I32, Bool>)" as a generic type with base "(I32, Pair".
fn parse_generic_type(ty: &str) -> Option<(&str, &str)> {
    // Find the first '<' that is NOT inside parentheses
    let mut paren_depth = 0;
    let angle_start = ty.char_indices().find(|(_, ch)| {
        match *ch {
            '(' => { paren_depth += 1; false }
            ')' => { paren_depth -= 1; false }
            '<' if paren_depth == 0 => true,
            _ => false,
        }
    }).map(|(i, _)| i);

    if let Some(start) = angle_start {
        let base = &ty[..start];
        // Find the matching '>' by tracking depth
        let mut depth = 0;
        let mut angle_end = None;
        for (i, ch) in ty.chars().enumerate() {
            match ch {
                '<' => depth += 1,
                '>' => {
                    depth -= 1;
                    if depth == 0 {
                        angle_end = Some(i);
                        break;
                    }
                }
                _ => {}
            }
        }
        if let Some(end) = angle_end {
            let type_args_str = &ty[start + 1..end];
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
    // Build concrete name using sanitized Tuff type names (not C types).
    // sanitize_type_name handles nested generics recursively.
    let sanitized_args: Vec<String> = type_args.iter()
        .map(|a| sanitize_type_name(a.trim()))
        .collect();
    let concrete_name = format!("{}_{}", base, sanitized_args.join("_"));
    // Recursively monomorphize any nested generic type args.
    let resolved_type_args: Vec<String> = type_args.iter().map(|arg| {
        if let Some((nested_base, nested_args)) = parse_generic_type_args(*arg) {
            monomorphize_generic_struct(ctx, nested_base, &nested_args)
                .map(|name| name.to_string())
        } else {
            tuff_type_to_c(ctx, arg)
        }
    }).collect::<Result<Vec<_>, _>>()?;
    if ctx.generated_instantiations.contains(&concrete_name) {
        return Ok(concrete_name);
    }
    let template = ctx.generic_structs.iter().find(|t| t.name == base)
        .ok_or_else(|| format!("Undefined generic struct: {}", base))?;
    // Clone template data to avoid holding immutable borrow on ctx during tuff_type_to_c calls
    let fields_str = template.fields_str.clone();
    let type_params = template.type_params.clone();
    let mut concrete_fields = String::new();
    let mut seen_fields: HashSet<String> = HashSet::new();
    for field in fields_str.split(',') {
        let field = field.trim();
        if field.is_empty() { continue; }
        if let Some(colon_pos) = field.find(':') {
            let field_name = field[..colon_pos].trim().to_string();
            if !seen_fields.insert(field_name.clone()) {
                return Err(format!("Duplicate struct field: {}", field_name));
            }
            let field_type = field[colon_pos + 1..].trim();
            let type_param_idx = type_params.iter().position(|p| p == field_type);
            let valid = is_valid_type(ctx, field_type);
            let resolved_type = if let Some(idx) = type_param_idx {
                let arg = resolved_type_args.get(idx)
                    .ok_or_else(|| format!("Missing type argument at index {} in '{}'", idx, base))?;
                arg.clone()
            } else if valid {
                let ft = field_type.to_string();
                tuff_type_to_c(ctx, &ft)?.to_string()
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

/// Find "." at the top level (not inside braces, brackets, or parens).
fn find_top_level_dot(s: &str) -> Option<usize> {
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
                return Some(i);
            }
            _ => {}
        }
    }
    None
}

/// Find ".length" at the top level (not inside braces, brackets, or parens).
fn find_top_level_dot_length(s: &str) -> Option<usize> {
    find_top_level_dot(s).and_then(|i| {
        if s[i..].starts_with(".length") { Some(i) } else { None }
    })
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
    fn test_line_comment() {
        expect_valid("let x = 5; // this is a comment\nx", "", 5);
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
    fn test_this_dot_field_access() {
        expect_valid("let x = 100; this.x", "", 100);
    }

    #[test]
    fn test_this_as_value_field_access() {
        expect_valid("let x = 100; let temp = this; temp.x", "", 100);
    }

    #[test]
    fn test_this_dot_mut_reassign() {
        expect_valid("let mut x = 100; this.x = 0; x", "", 0);
    }

    #[test]
    fn test_this_return_from_fn() {
        expect_valid("fn Wrapper() => { let field = 100; this } Wrapper().field", "", 100);
    }

    #[test]
    fn test_nested_fn_definition() {
        expect_valid("fn outer() => { fn inner() => 100; inner() } outer()", "", 100);
    }

    #[test]
    fn test_nested_fn_modifies_outer_mut() {
        expect_valid("fn outer() => { let mut counter = 0; fn add() => { counter += 1; }; add(); counter } outer()", "", 1);
    }

    #[test]
    fn test_this_return_method_call() {
        expect_valid("fn Factory() => { fn get() => 100; this } Factory().get()", "", 100);
    }

    #[test]
    fn test_this_return_with_nested_fn_and_let() {
        expect_valid("fn Counter() => { let mut value = 0; fn add() => { value += 1; }; this } let counter : Counter = Counter(); counter.add(); counter.value", "", 1);
    }

    #[test]
    fn test_this_return_no_semicolon_after_nested_fn() {
        expect_valid("fn Counter() => { let mut value = 0; fn add() => { value += 1; } this } let counter : Counter = Counter(); counter.add(); counter.value", "", 1);
    }

    #[test]
    fn test_counter_after_struct_def() {
        expect_valid("struct String { value : &Str } fn Counter() => { let mut value = 0; fn add() => { value += 1; } this } let counter : Counter = Counter(); counter.add(); counter.value", "", 1);
    }

    #[test]
    fn test_counter_after_union_type() {
        expect_valid("struct Some<T> { value : T } struct None<T> { } type Option<T> = Some<T> | None<T>; fn Counter() => { let mut value = 0; fn add() => { value += 1; } this } let counter : Counter = Counter(); counter.add(); counter.value", "", 1);
    }

    #[test]
    fn test_counter_after_generic_struct_with_nested_type() {
        // Reproduces cargo run failure: Vec<String> used as struct field type requires Vec<T> to be defined
        expect_valid("struct String { value : &Str } struct Vec<T> { } struct GenericStructTemplate { name : String, type_params : Vec<String>, fields_str : String } fn Counter() => { let mut value = 0; fn add() => { value += 1; } this } let counter : Counter = Counter(); counter.add(); counter.value", "", 1);
    }

    #[test]
    fn test_generic_type_in_struct_field() {
        // Reproduces cargo run failure: generic type (Vec<String>) used as struct field type
        expect_valid("struct String { value : &Str } struct Vec<T> { } struct Foo { items : Vec<String> }", "", 0);
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
    fn test_usize_type() {
        expect_valid("let x : USize = 10; x", "", 10);
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
    fn test_empty_function() {
        expect_valid("fn empty() : Void => {};", "", 0);
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
    fn test_generic_struct_two_type_args_as_field() {
        expect_valid(
            "struct Pair<A, B> { first : A, second : B } struct Container { pair : Pair<I32, Bool> };",
            "",
            0,
        );
    }

    #[test]
    fn test_nested_generic_struct_as_field() {
        expect_valid(
            "struct Wrapper<T> { value : T } struct Pair<A, B> { first : A, second : B } struct Container { wrapped : Wrapper<Pair<I32, Bool>> };",
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
    fn test_generic_function_array_length() {
        expect_valid(
            "fn get<L : USize>(value : I32) : [I32; L] => [value; L]; get<3>(100).length",
            "",
            3,
        );
    }

    #[test]
    fn test_rest_param_array_length() {
        expect_valid(
            "fn toArray<L : USize>(...args : [I32; L]) : [I32; L] => args; toArray(1, 2, 4).length",
            "",
            3,
        );
    }

    #[test]
    fn test_tuple_type_with_field_access() {
        expect_valid(
            "let x : (I32, I32) = (3, 4); x.0 + x.1",
            "",
            7,
        );
    }

    #[test]
    fn test_struct_field_with_tuple_type() {
        expect_valid(
            "struct Point { coords : (I32, I32) }; let p = Point { coords : (3, 4) }; p.coords.0 + p.coords.1",
            "",
            7,
        );
    }

    #[test]
    fn test_generic_struct_with_tuple_type_arg() {
        expect_valid(
            "struct Wrapper<T> { value : T }; let w : Wrapper<(I32, I32)> = Wrapper<(I32, I32)> { value : (3, 4) }; w.value.0 + w.value.1",
            "",
            7,
        );
    }

    #[test]
    fn test_generic_struct_with_tuple_containing_generic() {
        expect_valid(
            "struct Wrapper<T> { value : T } struct Pair<A, B> { first : A, second : B }; let w : Wrapper<(I32, Pair<I32, Bool>)> = Wrapper<(I32, Pair<I32, Bool>)> { value : (5, Pair<I32, Bool> { first : 3, second : 1 }) }; w.value.0 + w.value.1.first",
            "",
            8,
        );
    }

    #[test]
    fn test_is_type_check() {
        expect_valid("100 is I32", "", 1);
    }

    #[test]
    fn test_as_cast_is_check() {
        expect_valid("(100U8 as U16) is U16", "", 1);
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

    #[test]
    fn test_struct_destructuring() {
        expect_valid(
            "struct Point { x : I32, y : I32 }; let { x, y } = Point { x : 3, y : 4 }; x + y",
            "",
            7,
        );
    }

    #[test]
    fn test_extern_ffi() {
        expect_valid(
            "extern let { atoi } = extern stdlib; extern fn atoi(str : &Str) : I32; atoi(\"7\")",
            "",
            7,
        );
    }

    #[test]
    fn test_sizeof_extern_type() {
        expect_valid(
            "extern let { type uint8_t } = extern stdint; sizeOf<uint8_t>()",
            "",
            1,
        );
    }

    #[test]
    fn test_extern_fn_type_param() {
        expect_valid(
            "extern let { type uint8_t } = extern stdint; extern fn to_uint8(x : I32) : uint8_t; 0",
            "",
            0,
        );
    }

    #[test]
    fn test_extern_fn_is_type_check() {
        expect_valid(
            "extern let { strtol } = extern stdlib; extern fn strtol(str : &Str, end : &Str, base : I32) : I64; let x : I64 = strtol(\"100\", 0, 10); x is I64",
            "",
            1,
        );
    }

    #[test]
    fn test_pointer_deref() {
        expect_valid(
            "let x = 100; let y : &I32 = &x; *y",
            "",
            100,
        );
    }

    #[test]
    fn test_sizeof_on_let_rhs() {
        expect_valid(
            "let x = sizeOf<I32>(); x",
            "",
            4,
        );
    }

    #[test]
    fn test_sizeof_on_let_rhs_u64() {
        expect_valid(
            "let x = sizeOf<U64>(); x",
            "",
            8,
        );
    }

    #[test]
    fn test_sizeof_is_usize() {
        expect_valid(
            "sizeOf<U64>() is USize",
            "",
            1,
        );
    }

    #[test]
    fn test_sizeof_let_is_usize() {
        expect_valid(
            "let x = sizeOf<U64>(); x is USize",
            "",
            1,
        );
    }

    #[test]
    fn test_pointer_array_index() {
        expect_valid(
            "let array = [1, 2, 3]; let temp : &[I32; 3] = &array; temp[0]",
            "",
            1,
        );
    }

    #[test]
    fn test_extern_malloc_pointer() {
        expect_valid(
            "extern let { malloc } = extern stdlib; extern fn malloc(size : USize) : &[I32]; let ptr = malloc(sizeOf<I32>())",
            "",
            0,
        );
    }

    #[test]
    fn test_fn_modifies_outer_mut() {
        expect_valid(
            "let mut x = 0; fn add() => { x += 1; } add(); x",
            "",
            1,
        );
    }

    #[test]
    fn test_fn_modifies_outer_mut_with_struct() {
        expect_valid(
            "struct Point { x : I32 } let mut x = 0; fn add() => { x += 1; } add(); x",
            "",
            1,
        );
    }

    #[test]
    fn test_factory_return_with_this_call() {
        expect_valid(
            "fn Factory() => { fn get(&this) => 100; this } Factory().get()",
            "",
            100,
        );
    }

    #[test]
    fn test_factory_explicit_this_type() {
        expect_valid(
            "fn Factory() => { fn get(this : &Factory) => 100; this } Factory().get()",
            "",
            100,
        );
    }

    #[test]
    fn test_factory_with_mut_state_and_field_access() {
        expect_valid(
            "fn Counter() => { let mut value = 0; fn add() => { value += 1; }; this } let counter : Counter = Counter(); counter.add(); counter.value",
            "",
            1,
        );
    }

    #[test]
    fn test_factory_is_type_check() {
        expect_valid(
            "fn Counter() => { let mut value = 0; fn add() => { value += 1; }; this } Counter() is Counter",
            "",
            1,
        );
    }

    #[test]
    fn test_factory_returns_this_with_newline_before_closing_brace() {
        // Regression test: `this` on its own line before the closing brace (rather than
        // "... this }" on one line) must still be recognized as a this-returning function.
        expect_valid(
            "fn Counter() => {\n    let mut value = 0;\n    fn add() => {\n        value += 1;\n    }\n    this\n}\nCounter() is Counter",
            "",
            1,
        );
    }

    #[test]
    fn test_factory_counter_with_add_and_field_access() {
        expect_valid(
            "fn Counter() => {\n    let mut value = 0;\n    fn add() => {\n        value += 1;\n    }\n    this\n}\nlet first = Counter();\nfirst.add();\nfirst.value",
            "",
            1,
        );
    }

    #[test]
    fn test_factory_counter_mut_this_receiver() {
        expect_valid(
            "fn Counter() => {\n    let mut value = 0;\n    fn add(&mut this) => {\n        value += 1;\n    }\n    this\n}",
            "",
            0,
        );
    }

    #[test]
    fn test_factory_multiple_counters_independent_state() {
        expect_valid(
            "fn Counter() => {\n    let mut value = 0;\n    fn add(&mut this) => {\n        value += 1;\n    }\n    this\n}\nlet mut first = Counter();\nfirst.add();\nfirst.add();\n\nlet mut second = Counter();\nsecond.add();\n\nfirst.value",
            "",
            2,
        );
    }

    #[test]
    fn test_nested_factory_chained_call() {
        expect_valid(
            "fn Outer() => {\n    fn Inner() => {\n        fn get() => 100;\n        this\n    }\n    this\n}\nOuter().Inner().get()",
            "",
            100,
        );
    }

    #[test]
    fn test_main_tuff() {
        expect_valid(
            "fn a() => {\n    let value = 100;\n    fn b() => value;\n    this\n}\n\na().value",
            "",
            100,
        );
    }

    #[test]
    fn test_main_tuff_method_call() {
        expect_valid(
            "fn a() => {\n    let value = 100;\n    fn b() => value;\n    this\n}\n\na().b()",
            "",
            100,
        );
    }

    #[test]
    fn test_main_tuff_let_outside_fn() {
        expect_valid(
            "let value = 100;\nfn a() => {\n    fn b() => value;\n    this\n}\n\na().b()",
            "",
            100,
        );
    }

    #[test]
    fn test_main_tuff_triple_nested_factory() {
        expect_valid(
            "fn a() => {\n    fn b() => {\n        fn c() => 100;\n\n        this    \n    }\n\n    this\n}\n\na().b().c()",
            "",
            100,
        );
    }

    #[test]
    fn test_main_tuff_nested_with_params() {
        expect_valid(
            "fn Outer(foo : I32) => {\n    fn Inner(bar : I32) => {\n        fn sum() => foo + bar;\n        this    \n    }\n\n    this\n}\n\nOuter(25).Inner(75).sum()",
            "",
            100,
        );
    }
}
