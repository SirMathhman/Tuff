use std::{
    fmt::Error,
    fs::{read, read_to_string, write},
};

fn compile(source: &str) -> Result<&str, Error> {
    todo!("Impl the compiler here");
}

fn main() {
    match read_to_string("./src/main.tuff") {
        Ok(source) => match compile(source.as_str()) {
            Ok(generated) => match write("./src/main/tuff.c", generated) {
                Ok(_) => {
                    println!("{}", "Compilation successful!")
                }
                Err(e) => eprintln!("{}", e),
            },
            Err(e) => eprintln!("{}", e),
        },
        Err(e) => eprintln!("{}", e),
    }
}

fn assert_valid(source: &str, std_in: &str, expected_exit_code: i32) {
    let result = compile(source);
    if result.is_err() {
        panic!("{}", result.unwrap_err());
    }

    let generated = result.unwrap();
    // Write to a temporary .c file
    // Compile the .c file using clang (in PATH already)
    // Execute the generated .exe
    todo!();

    let actual_exit_code = -1;
    assert_eq!(expected_exit_code, actual_exit_code);
}

fn assert_invalid(source: &str) {
    assert_eq!(compile(source).is_err(), true);
}


