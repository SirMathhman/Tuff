use std::process::Command;

fn main() {
    let output = Command::new("cargo")
        .args(&["test", "test_while_loop_basic", "--", "--nocapture"])
        .output()
        .expect("Failed to execute test");

    println!("stdout: {}", String::from_utf8_lossy(&output.stdout));
    println!("stderr: {}", String::from_utf8_lossy(&output.stderr));
}
