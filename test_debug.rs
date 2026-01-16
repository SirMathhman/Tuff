use std::process::Command;

fn main() {
    let test_input = r#"fn a(first : I32) : (I32) => I32 => fn second(second : I32) => first + second; a(3)"#;
    
    // Try to interpret this manually
    println!("Testing: {}", test_input);
    
    // Compile and run the interpreter
    let output = Command::new("cargo")
        .args(&["run", "--", test_input])
        .current_dir("C:\\Users\\mathm\\IdeaProjects\\Tuff")
        .output();
    
    match output {
        Ok(output) => {
            println!("stdout: {}", String::from_utf8_lossy(&output.stdout));
            println!("stderr: {}", String::from_utf8_lossy(&output.stderr));
        }
        Err(e) => println!("Error: {}", e),
    }
}
