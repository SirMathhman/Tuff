use std::io::{self, BufRead, Write};

fn execute_tuff(_source: &str) -> i64 {
    /*This is a TODO for now.*/
    todo!()
}

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();

    println!("Tuff REPL (type 'quit' to exit)");

    loop {
        write!(out, "> ").unwrap();
        out.flush().unwrap();

        let line = stdin.lock().lines().next().unwrap().unwrap();

        if line.trim() == "quit" {
            break;
        }

        if line.trim().is_empty() {
            continue;
        }

        match std::panic::catch_unwind(|| execute_tuff(&line)) {
            Ok(result) => println!("= {}", result),
            Err(_) => println!("error: evaluation failed"),
        }
    }
}
