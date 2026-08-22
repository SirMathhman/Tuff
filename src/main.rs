use std::process::ExitCode;

fn main() -> ExitCode {
    let input = std::env::args().nth(1).unwrap_or_default();
    match tuffc::evaluate(&input) {
        Ok(value) => {
            println!("{value}");
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprintln!("{err}");
            ExitCode::FAILURE
        }
    }
}
