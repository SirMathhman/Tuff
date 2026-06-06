use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};

fn compile_tuff_to_c(_tuff_source: &str) -> String {
    // TODO: Parse Tuff source and emit C source.
    // For now, wrap in a minimal C program.
    format!(
        "#include <stdio.h>\n\nint main() {{\n{body}\n  return 0;\n}}",
        body = "// TODO: lowered Tuff statements go here"
    )
}

fn execute_tuff(tuff_source: &str, std_in: Option<&str>) -> i32 {
    // 1) Compile Tuff source to C.
    let c_source = compile_tuff_to_c(tuff_source);

    // 2) Write C source to a temp file and compile with clang.
    let out_dir = std::env::temp_dir().join("tuffc-out");
    fs::create_dir_all(&out_dir).expect("failed to create output dir");

    let c_path = out_dir.join("main.c");
    let exe_path = out_dir.join("main.exe");

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

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: tuffc <file.tuff>");
        std::process::exit(1);
    }

    let path = &args[1];
    let source = fs::read_to_string(path).unwrap_or_else(|e| {
        eprintln!("failed to read {}: {}", path, e);
        std::process::exit(1);
    });

    // Pass through stdin if the terminal is a TTY (interactive input available)
    let exit_code = execute_tuff(&source, None);
    std::process::exit(exit_code);
}
