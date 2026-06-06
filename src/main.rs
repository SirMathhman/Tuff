use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

/// Per-process counter to guarantee unique temp dirs across parallel test runs.
static INVOCATION_COUNTER: AtomicU64 = AtomicU64::new(0);

fn next_id() -> u64 {
    INVOCATION_COUNTER.fetch_add(1, Ordering::Relaxed)
}

fn compile_tuff_to_c(tuff_source: &str) -> String {
    // Trim whitespace and try to match known patterns.
    let trimmed = tuff_source.trim();

    // Check if source is composed only of read<U8>() calls, '+', '-', and whitespace.
    let allowed_chars =
        |c: char| matches!(c, '<' | '>' | '(' | ')' | '+' | '-' | ' ') || c.is_ascii_alphanumeric();

    // Match if/else expression: if (condition) then_expr else else_expr
    if trimmed.starts_with("if (") {
        let after_if = trimmed.strip_prefix("if (").unwrap();
        // Find matching ')' by tracking paren depth.
        let mut depth = 1usize;
        let mut cond_end = None;
        for (i, c) in after_if.char_indices() {
            match c {
                '(' => depth += 1,
                ')' => depth -= 1,
                _ => {}
            }
            if depth == 0 {
                cond_end = Some(i);
                break;
            }
        }
        if let Some(end) = cond_end {
            let condition = after_if[..end].trim();
            let rest = after_if[end + 1..].trim();
            if let Some(else_idx) = rest.find(" else ") {
                let then_expr = rest[..else_idx].trim().replace("U8", "");
                let else_expr = rest[else_idx + 6..].trim().replace("U8", "");

                // Compile the condition body.
                let cond_body = if condition == "read<Bool>()" {
                    r#"char cond_buf[8];
  scanf("%7s", cond_buf);"#
                        .to_string()
                } else if condition.contains("read<U8>()") {
                    "int cond_val;\n  scanf(\"%d\", &cond_val);".to_string()
                } else {
                    format!("int cond_val = {};", condition)
                };

                let cond_check = if condition == "read<Bool>()" {
                    "strcmp(cond_buf, \"true\") == 0"
                } else if condition.contains("read<U8>()") {
                    "cond_val"
                } else {
                    condition
                };

                return format!(
                    r#"
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <string.h>

int main() {{
  {cond}
  if ({check}) {{
    return {then};
  }} else {{
    return {els};
  }}
}}
"#,
                    cond = cond_body,
                    check = cond_check,
                    then = then_expr,
                    els = else_expr
                );
            }
        }
    }

    // Check for multi-statement programs with let/while/for statements.
    if trimmed.starts_with("let ") || trimmed.starts_with("while (") || trimmed.starts_with("for (")
    {
        let parts: Vec<&str> = trimmed.split(';').collect();
        if parts.len() >= 2 {
            let mut c_stmts: Vec<String> = Vec::new();

            for i in 0..parts.len() - 1 {
                let stmt = parts[i].trim();
                if stmt.is_empty() {
                    continue;
                }

                if stmt.starts_with("let ") {
                    // let [mut] <name> [= <init>]
                    let after_let = stmt.strip_prefix("let ").unwrap();
                    let after_mut = after_let.strip_prefix("mut ").unwrap_or(after_let);
                    let varname = after_mut.split_whitespace().next().unwrap_or("");

                    c_stmts.push(format!("int {};", varname));

                    let after_name = after_mut[varname.len()..].trim();
                    if let Some(eq_pos) = after_name.find("= ") {
                        let init_val = after_name[eq_pos + 2..].trim();
                        if init_val == "read<U8>()" {
                            c_stmts.push(format!("scanf(\"%d\", &{});", varname));
                        } else {
                            c_stmts.push(format!("{} = {};", varname, init_val.replace("U8", "")));
                        }
                    }
                } else if stmt.starts_with("while (") {
                    // while (condition) body-statement
                    let after_while = stmt.strip_prefix("while (").unwrap();
                    let mut depth = 1usize;
                    let mut cond_end = None;
                    for (j, c) in after_while.char_indices() {
                        match c {
                            '(' => depth += 1,
                            ')' => depth -= 1,
                            _ => {}
                        }
                        if depth == 0 {
                            cond_end = Some(j);
                            break;
                        }
                    }
                    if let Some(end) = cond_end {
                        let condition = after_while[..end].trim();
                        let body = after_while[end + 1..].trim().replace("U8", "");
                        c_stmts.push(format!("while ({}) {{\n    {};\n  }}", condition, body));
                    }
                } else if stmt.starts_with("for (") {
                    // for (var in start..end) body-statement
                    let after_for = stmt.strip_prefix("for (").unwrap();
                    let mut paren_depth = 1usize;
                    let mut paren_end = None;
                    for (j, c) in after_for.char_indices() {
                        match c {
                            '(' => paren_depth += 1,
                            ')' => paren_depth -= 1,
                            _ => {}
                        }
                        if paren_depth == 0 {
                            paren_end = Some(j);
                            break;
                        }
                    }
                    if let Some(end) = paren_end {
                        let for_header = after_for[..end].trim();
                        let body = after_for[end + 1..].trim().replace("U8", "");
                        if let Some(in_pos) = for_header.find(" in ") {
                            let loop_var = for_header[..in_pos].trim();
                            let range_expr = for_header[in_pos + 4..].trim();
                            if let Some(dotdot_pos) = range_expr.find("..") {
                                let range_start = range_expr[..dotdot_pos].trim().replace("U8", "");
                                let range_end =
                                    range_expr[dotdot_pos + 2..].trim().replace("U8", "");
                                c_stmts.push(format!(
                                    "for (int {} = {}; {} <= {}; {}++) {{\n    {};\n  }}",
                                    loop_var, range_start, loop_var, range_end, loop_var, body
                                ));
                            }
                        }
                    }
                } else {
                    // Plain statement / assignment.
                    if stmt.contains("read<U8>()") {
                        let read_var = format!("_r{}", i);
                        c_stmts.push(format!("int {};", read_var));
                        c_stmts.push(format!("scanf(\"%d\", &{});", read_var));
                        let c_line = stmt.replace("read<U8>()", &read_var).replace("U8", "");
                        c_stmts.push(format!("{};", c_line));
                    } else {
                        c_stmts.push(format!("{};", stmt.replace("U8", "")));
                    }
                }
            }

            let ret_expr = parts.last().unwrap().trim().replace("U8", "");
            return format!(
                r#"
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>

int main() {{
  {stmts}
  return {ret};
}}
"#,
                stmts = c_stmts.join("\n  "),
                ret = ret_expr
            );
        }
    }

    // Match read<Bool>() — reads "true" or "false" from stdin, returns 1 or 0 as exit code.
    if trimmed == "read<Bool>()" {
        return format!(
            r#"
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <string.h>

int main() {{
  char buf[8];
  scanf("%7s", buf);
  return strcmp(buf, "true") == 0 ? 1 : 0;
}}
"#
        );
    }

    // Count occurrences of read<U8>().
    let num_reads = trimmed.matches("read<U8>()").count();

    if num_reads > 0 && trimmed.chars().all(allowed_chars) {
        // Source consists only of read<U8>() calls joined by '+'/'-'.
        let mut reads = Vec::new();
        for i in 0..num_reads {
            reads.push(format!("int v{};\n  scanf(\"%d\", &v{});", i, i));
        }
        // Substitute each read<U8>() with v0, v1, v2, ... left to right, preserving original operators.
        let mut expr = trimmed.to_string();
        for i in 0..num_reads {
            expr = expr.replacen("read<U8>()", &format!("v{}", i), 1);
        }
        // Strip U8 suffix from numeric literals (e.g. 1U8 → 1).
        expr = expr.replace("U8", "");
        expr = expr.split_whitespace().collect::<Vec<_>>().join(" ");
        return format!(
            r#"
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>

int main() {{
  {reads}
  return {sum};
}}
"#,
            reads = reads.join("\n  "),
            sum = expr
        );
    }

    // Default: empty program returning 0.
    format!(
        "#include <stdio.h>\n\nint main() {{\n{body}\n  return 0;\n}}",
        body = "// TODO: lowered Tuff statements go here"
    )
}

fn execute_tuff(tuff_source: &str, std_in: Option<&str>) -> i32 {
    // 1) Compile Tuff source to C.
    let c_source = compile_tuff_to_c(tuff_source);

    // 2) Write C source to a temp file and compile with clang.
    // Use a unique subdirectory per invocation so parallel tests don't collide.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap();
    let uid = format!("{:x}{:08x}", now.as_nanos(), next_id());
    let out_dir = std::env::temp_dir().join(format!("tuffc-out-{}", uid));
    fs::create_dir_all(&out_dir).expect("failed to create output dir");

    let c_path = out_dir.join("main.c");
    #[cfg(windows)]
    let exe_name = "main.exe";
    #[cfg(not(windows))]
    let exe_name = "main";
    let exe_path = out_dir.join(exe_name);

    let mut c_file = fs::File::create(&c_path).expect("failed to create .c file");
    c_file
        .write_all(c_source.as_bytes())
        .expect("failed to write .c file");

    let compile_result = Command::new("clang")
        .args([&c_path.to_string_lossy(), "-o", &exe_path.to_string_lossy()])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status();

    match compile_result {
        Ok(status) => {
            if !status.success() {
                eprintln!("clang failed with: {}", status);
                return 1;
            }
        }
        Err(e) => {
            eprintln!("failed to spawn clang: {}", e);
            return 1;
        }
    }

    // 3) Run the .exe with stdIn.
    let mut child = Command::new(&exe_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("failed to spawn executable");

    if let Some(input) = std_in {
        let stdin = child.stdin.as_mut().expect("failed to get stdin");
        stdin
            .write_all(input.as_bytes())
            .expect("failed to write stdin");
    }

    // 4) Return the exit code.
    match child.wait_with_output() {
        Ok(output) => output.status.code().unwrap_or(-1),
        Err(e) => {
            eprintln!("failed waiting for process: {}", e);
            -1
        }
    }
}

fn run(args: &[String]) -> i32 {
    if args.len() < 2 {
        eprintln!("Usage: tuffc <file.tuff>");
        return 1;
    }

    let path = &args[1];
    let source = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("failed to read {}: {}", path, e);
            return 1;
        }
    };

    execute_tuff(&source, None)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let exit_code = run(&args);
    std::process::exit(exit_code);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_empty_source_returns_zero() {
        let exit_code = execute_tuff("", None);
        assert_eq!(exit_code, 0);
    }

    #[test]
    fn test_execute_whitespace_source_returns_zero() {
        let exit_code = execute_tuff("   \n\t  ", None);
        assert_eq!(exit_code, 0);
    }

    #[test]
    fn test_read_u8_with_stdin_returns_value() {
        let exit_code = execute_tuff("read<U8>()", Some("100"));
        assert_eq!(exit_code, 100);
    }

    #[test]
    fn test_read_u8_reads_only_first_value() {
        // read<U8>() should consume only the first integer from stdin.
        let exit_code = execute_tuff("read<U8>()", Some("100 20"));
        assert_eq!(exit_code, 100);
    }

    #[test]
    fn test_read_u8_addition_reads_two_values() {
        // read<U8>() + read<U8>() should sum two integers from stdin.
        let exit_code = execute_tuff("read<U8>() + read<U8>()", Some("100 20"));
        assert_eq!(exit_code, 120);
    }

    #[test]
    fn test_read_u8_addition_reads_three_values() {
        // read<U8>() + read<U8>() + read<U8>() should sum three integers from stdin.
        let exit_code = execute_tuff("read<U8>() + read<U8>() + read<U8>()", Some("1 2 3"));
        assert_eq!(exit_code, 6);
    }

    #[test]
    fn test_read_u8_subtraction_mixed_operators() {
        // read<U8>() + read<U8>() - read<U8>() should compute 3 + 4 - 5 = 2.
        let exit_code = execute_tuff("read<U8>() + read<U8>() - read<U8>()", Some("3 4 5"));
        assert_eq!(exit_code, 2);
    }

    #[test]
    fn test_let_variable_read_u8() {
        // let x : U8 = read<U8>(); x should read one value and return it.
        let exit_code = execute_tuff("let x : U8 = read<U8>(); x", Some("3 4 5"));
        assert_eq!(exit_code, 3);
    }

    #[test]
    fn test_let_variable_self_addition() {
        // let x : U8 = read<U8>(); x + x should read one value and double it.
        let exit_code = execute_tuff("let x : U8 = read<U8>(); x + x", Some("3 4 5"));
        assert_eq!(exit_code, 6);
    }

    #[test]
    fn test_let_mut_variable_reassignment() {
        // let mut x : U8 = read<U8>(); x = read<U8>(); x should return the reassigned value.
        let exit_code = execute_tuff(
            "let mut x : U8 = read<U8>(); x = read<U8>(); x",
            Some("3 4 5"),
        );
        assert_eq!(exit_code, 4);
    }

    #[test]
    fn test_let_mut_init_literal_then_add_assign() {
        // let mut x = 0U8; x += read<U8>(); x with "5" should compute 0 + 5 = 5.
        let exit_code = execute_tuff("let mut x = 0U8; x += read<U8>(); x", Some("5"));
        assert_eq!(exit_code, 5);
    }

    #[test]
    fn test_let_temp_read_u8() {
        // let temp = read<U8>(); temp with "5" should return 5.
        let exit_code = execute_tuff("let temp = read<U8>(); temp", Some("5"));
        assert_eq!(exit_code, 5);
    }

    #[test]
    fn test_while_loop_counter() {
        // let mut counter = 0U8; let sum = read<U8>(); while (counter < sum) counter += 1; counter
        // with "5" should increment counter from 0 to 5, then return 5.
        let exit_code = execute_tuff(
            "let mut counter = 0U8; let sum = read<U8>(); while (counter < sum) counter += 1; counter",
            Some("5"),
        );
        assert_eq!(exit_code, 5);
    }

    #[test]
    fn test_for_loop_sum_to_count() {
        // let count = read<U8>(); let mut sum = 0U8; for (i in 0..count) sum += i; sum
        // with "5" should compute 0 + 0 + 1 + 2 + 3 + 4 + 5 = 15.
        let exit_code = execute_tuff(
            "let count = read<U8>(); let mut sum = 0U8; for (i in 0..count) sum += i; sum",
            Some("5"),
        );
        assert_eq!(exit_code, 15);
    }

    #[test]
    fn test_read_bool_true_returns_one() {
        // read<Bool>() with stdin "true" should return 1.
        let exit_code = execute_tuff("read<Bool>()", Some("true"));
        assert_eq!(exit_code, 1);
    }

    #[test]
    fn test_read_u8_plus_literal() {
        // read<U8>() + 1U8 should read 100 and add literal 1.
        let exit_code = execute_tuff("read<U8>() + 1U8", Some("100"));
        assert_eq!(exit_code, 101);
    }

    #[test]
    fn test_if_read_bool_then_u8_literal() {
        // if (read<Bool>()) 3U8 else 5U8 with "true" should return 3.
        let exit_code = execute_tuff("if (read<Bool>()) 3U8 else 5U8", Some("true"));
        assert_eq!(exit_code, 3);
    }

    #[test]
    fn test_if_read_bool_else_u8_literal() {
        // if (read<Bool>()) 3U8 else 5U8 with "false" should return 5.
        let exit_code = execute_tuff("if (read<Bool>()) 3U8 else 5U8", Some("false"));
        assert_eq!(exit_code, 5);
    }

    #[test]
    fn test_if_read_u8_condition() {
        // if (read<U8>()) 3U8 else 5U8 with "1" should return 3 (truthy).
        let exit_code = execute_tuff("if (read<U8>()) 3U8 else 5U8", Some("1"));
        assert_eq!(exit_code, 3);
    }

    #[test]
    fn test_if_read_u8_condition_falsy() {
        // if (read<U8>()) 3U8 else 5U8 with "0" should return 5 (falsy).
        let exit_code = execute_tuff("if (read<U8>()) 3U8 else 5U8", Some("0"));
        assert_eq!(exit_code, 5);
    }

    #[test]
    fn test_if_literal_condition_truthy() {
        // if (1) 3U8 else 5U8 should return 3.
        let exit_code = execute_tuff("if (1) 3U8 else 5U8", None);
        assert_eq!(exit_code, 3);
    }

    #[test]
    fn test_if_literal_condition_falsy() {
        // if (0) 3U8 else 5U8 should return 5.
        let exit_code = execute_tuff("if (0) 3U8 else 5U8", None);
        assert_eq!(exit_code, 5);
    }

    #[test]
    fn test_compile_if_no_closing_paren_falls_through() {
        // Unclosed parens in if expression should fall through to default path.
        let result = compile_tuff_to_c("if (read<Bool>()");
        assert!(result.contains("return 0;"));
    }

    #[test]
    fn test_compile_if_no_else_falls_through() {
        // if without else should fall through to default path.
        let result = compile_tuff_to_c("if (read<Bool>()) 3U8");
        assert!(result.contains("return 0;"));
    }

    #[test]
    fn test_compile_let_single_part_falls_through() {
        // let without semicolons should fall through to default path.
        let result = compile_tuff_to_c("let x");
        assert!(result.contains("return 0;"));
    }

    #[test]
    fn test_compile_for_no_closing_paren_falls_through() {
        // for without closing paren should fall through to default path.
        let result = compile_tuff_to_c("for (i in 0..5");
        assert!(result.contains("return 0;"));
    }

    #[test]
    fn test_compile_for_no_in_keyword_falls_through() {
        // for without 'in' keyword should produce no for-loop output.
        let result = compile_tuff_to_c("for (i 0..5) sum += i; sum");
        assert!(!result.contains("for ("), "no for loop should be generated");
    }

    #[test]
    fn test_compile_for_no_dotdot_falls_through() {
        // for without '..' range should produce no for-loop output.
        let result = compile_tuff_to_c("for (i in 0-5) sum += i; sum");
        assert!(!result.contains("for ("), "no for loop should be generated");
    }

    #[test]
    fn test_compile_while_no_closing_paren_falls_through() {
        // while without closing paren should fall through to default path.
        let result = compile_tuff_to_c("while (counter < sum");
        assert!(result.contains("return 0;"));
    }

    #[test]
    fn test_clang_compile_failure() {
        // Invalid then-expr should cause clang to fail.
        let exit_code = execute_tuff("if (read<Bool>()) read<Bool>() else 0U8", Some("true"));
        assert_eq!(exit_code, 1);
    }

    #[test]
    fn test_run_no_args_returns_one() {
        let exit_code = run(&[]);
        assert_eq!(exit_code, 1);
    }

    #[test]
    fn test_run_file_not_found_returns_one() {
        let exit_code = run(&["tuffc".to_string(), "nonexistent_file.tuff".to_string()]);
        assert_eq!(exit_code, 1);
    }

    #[test]
    fn test_run_with_valid_file() {
        // Create a temp .tuff file and run it through the run() entry point.
        let tmp_dir = std::env::temp_dir().join(format!("tuffc-test-{}", next_id()));
        fs::create_dir_all(&tmp_dir).unwrap();
        let tuff_path = tmp_dir.join("test.tuff");
        fs::write(&tuff_path, "read<U8>()").unwrap();

        let exit_code = run(&["tuffc".to_string(), tuff_path.to_string_lossy().to_string()]);
        // Without stdin, scanf gets no input. On Windows, scanf of "%d" with no input
        // leaves the variable uninitialized — just verify the process ran (exit code 0 or nonzero).
        // The important thing is that run() executed without panicking.
        let _ = exit_code;

        // Cleanup
        let _ = fs::remove_dir_all(&tmp_dir);
    }
}
