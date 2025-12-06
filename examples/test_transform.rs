use tuff::statement::transform_class_to_fn;

fn main() {
    let input = "class fn Point(x : I32, y : I32) => {fn manhattan() => x + y;}";
    let transformed = transform_class_to_fn(input);
    println!("Input:\n{}\n", input);
    println!("Transformed:\n{}", transformed);
}
