// Tuff Compiler - Main Entry Point

mod compiler;

use compiler::lexer::Lexer;
use compiler::parser::Parser;
use compiler::type_checker::TypeChecker;
use compiler::borrow_checker::BorrowChecker;
use compiler::codegen::CodeGenerator;
use std::env;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::Command;

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        print_usage(&args[0]);
        return;
    }

    let input_file = &args[1];
    
    // Determine output file (replace .tuff with .c)
    let output_file = if input_file.ends_with(".tuff") {
        format!("{}.c", &input_file[..input_file.len() - 5])
    } else {
        format!("{}.c", input_file)
    };

    match compile_file(input_file, &output_file) {
        Ok(_) => {
            println!("✓ Compiled {} to {}", input_file, output_file);
            
            // Optional: compile the generated C code
            if args.len() > 2 && args[2] == "--run" {
                if let Err(e) = compile_and_run_c(&output_file) {
                    eprintln!("Error running C compiler: {}", e);
                }
            }
        }
        Err(e) => {
            eprintln!("✗ Compilation failed: {}", e);
            std::process::exit(1);
        }
    }
}

fn print_usage(prog_name: &str) {
    println!("Tuff Compiler v0.1.0");
    println!("Usage: {} <input.tuff> [--run]", prog_name);
    println!("  --run    Compile generated C code and run it");
}

fn compile_file(input_file: &str, output_file: &str) -> Result<(), String> {
    // Read input file
    let source = fs::read_to_string(input_file)
        .map_err(|e| format!("Cannot read {}: {}", input_file, e))?;

    // Lexical analysis
    let mut lexer = Lexer::new(&source, input_file);
    let tokens = lexer.tokenize();

    // Parsing
    let mut parser = Parser::new(tokens, input_file.to_string());
    let program = parser.parse()
        .map_err(|errs| format_errors(&errs))?;

    // Type checking
    let mut type_checker = TypeChecker::new();
    type_checker.check_program(&program)
        .map_err(|errs| format_errors(&errs))?;

    // Borrow checking
    let mut borrow_checker = BorrowChecker::new();
    borrow_checker.check_program(&program)
        .map_err(|errs| format_errors(&errs))?;

    // Code generation
    let mut codegen = CodeGenerator::new();
    codegen.generate_program(&program);
    let c_code = codegen.finish();

    // Write generated C code
    fs::write(output_file, c_code)
        .map_err(|e| format!("Cannot write {}: {}", output_file, e))?;

    Ok(())
}

fn compile_and_run_c(c_file: &str) -> Result<(), String> {
    let exe_file = if cfg!(windows) {
        format!("{}.exe", &c_file[..c_file.len() - 2])
    } else {
        c_file[..c_file.len() - 2].to_string()
    };

    // Compile C code
    let output = Command::new("gcc")
        .args(&[c_file, "-o", &exe_file])
        .output()
        .map_err(|e| format!("Failed to run gcc: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("C compilation failed:\n{}", stderr));
    }

    println!("✓ Compiled C to {}", exe_file);

    // Run the executable
    let output = Command::new(&exe_file)
        .output()
        .map_err(|e| format!("Failed to run {}: {}", exe_file, e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !stdout.is_empty() {
        println!("--- Program Output ---");
        print!("{}", stdout);
    }
    if !stderr.is_empty() {
        eprintln!("--- Program Stderr ---");
        eprint!("{}", stderr);
    }

    Ok(())
}

fn format_errors(errs: &[compiler::error::CompileError]) -> String {
    errs.iter()
        .map(|e| format!("{:?}", e))
        .collect::<Vec<_>>()
        .join("\n")
}
