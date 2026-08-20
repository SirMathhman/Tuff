use std::process::ExitCode;

use tuffc::interpret;

fn main() -> ExitCode {
    let input = std::env::args().nth(1).unwrap_or_default();
    match interpret(&input) {
        Ok(value) => {
            println!("{value}");
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprintln!("error: {err}");
            ExitCode::FAILURE
        }
    }
}
