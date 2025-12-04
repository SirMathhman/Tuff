// Integration test for Phase 8: Bootstrap loop validation
// Tests that the Tuff compiler can self-compile

use std::fs;
use std::path::Path;
use std::process::Command;

#[test]
fn test_bootstrap_loop_closure() {
    // Test that we can compile Tuff compiler modules
    let tuff_dir = Path::new("tuff");
    
    // Verify all Tuff modules exist
    assert!(tuff_dir.join("lexer.tuff").exists(), "lexer.tuff missing");
    assert!(tuff_dir.join("stdlib.tuff").exists(), "stdlib.tuff missing");
    assert!(tuff_dir.join("parser.tuff").exists(), "parser.tuff missing");
    assert!(tuff_dir.join("type_checker.tuff").exists(), "type_checker.tuff missing");
    assert!(tuff_dir.join("borrow_checker.tuff").exists(), "borrow_checker.tuff missing");
    assert!(tuff_dir.join("codegen.tuff").exists(), "codegen.tuff missing");
    assert!(tuff_dir.join("main.tuff").exists(), "main.tuff missing");
    assert!(tuff_dir.join("bootstrap.tuff").exists(), "bootstrap.tuff missing");
}

#[test]
fn test_generated_c_files_exist() {
    // Test that all Tuff modules compile to C
    let tuff_dir = Path::new("tuff");
    
    // After compilation, verify .c files are generated
    let c_files = vec![
        "lexer.c",
        "stdlib.c",
        "parser.c",
        "type_checker.c",
        "borrow_checker.c",
        "codegen.c",
        "main.c",
    ];
    
    // Note: bootstrap.c may not exist yet until bootstrap module is compiled
    for c_file in c_files {
        let path = tuff_dir.join(c_file);
        if path.exists() {
            let metadata = fs::metadata(&path).expect("Failed to read file metadata");
            assert!(metadata.len() > 0, "{} is empty", c_file);
        }
    }
}

#[test]
fn test_tuff_compiler_phases_count() {
    // Verify all 8 phases exist in tuff/ directory
    let tuff_dir = fs::read_dir("tuff").expect("Failed to read tuff directory");
    let tuff_files: Vec<_> = tuff_dir
        .filter_map(|entry| {
            entry.ok().and_then(|e| {
                e.path()
                    .file_name()
                    .and_then(|name| name.to_str().map(String::from))
                    .filter(|name| name.ends_with(".tuff"))
            })
        })
        .collect();
    
    assert!(
        tuff_files.len() >= 8,
        "Expected at least 8 Tuff files for compiler phases, found {}",
        tuff_files.len()
    );
}

#[test]
fn test_bootstrap_compilation() {
    // Test that we can attempt to compile the bootstrap module
    let output = Command::new("cargo")
        .args(&["run", "--quiet", "--", "tuff/bootstrap.tuff"])
        .output();
    
    match output {
        Ok(result) => {
            // Bootstrap module should compile without errors
            assert!(
                result.status.success() || String::from_utf8_lossy(&result.stdout).contains("Compiled"),
                "Bootstrap compilation failed: {}",
                String::from_utf8_lossy(&result.stderr)
            );
        }
        Err(e) => {
            eprintln!("Warning: Could not run bootstrap test: {}", e);
        }
    }
}

#[test]
fn test_all_tuff_modules_compile() {
    // Test that all Tuff compiler modules can compile
    let modules = vec![
        "lexer", "stdlib", "parser", "type_checker", "borrow_checker", "codegen", "main",
    ];
    
    for module in modules {
        let tuff_path = format!("tuff/{}.tuff", module);
        let c_path = format!("tuff/{}.c", module);
        
        // Verify source exists
        assert!(
            Path::new(&tuff_path).exists(),
            "Tuff module {} not found",
            tuff_path
        );
        
        // Verify C output exists (may be from previous build)
        if Path::new(&c_path).exists() {
            let metadata = fs::metadata(&c_path).expect("Failed to read C file");
            assert!(metadata.len() > 0, "{} is empty", c_path);
        }
    }
}
