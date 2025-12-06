use tuff::interpret;

#[test]
fn generic_struct_construct_access() {
    let res = interpret("struct Wrapper<T> { value : T } Wrapper<I32> { 100 }.value");
    eprintln!("single test result: {:?}", res);
    assert_eq!(res, Ok("100".to_string()));
}
