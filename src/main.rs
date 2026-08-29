fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        println!("usage: tuffc <expression>");
        return;
    }
    let input = args[1..].join(" ");
    match tuffc::evaluate(&input) {
        Ok(value) => println!("{value}"),
        Err(err) => eprintln!("error: {err}"),
    }
}
