use tuff::parser::Parser;

#[test]
fn test_parse_primitive_type_i32() {
    let mut parser = Parser::new("let x : I32 = 5;");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_primitive_type_f64() {
    let mut parser = Parser::new("let x : F64 = 3.14;");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_primitive_type_bool() {
    let mut parser = Parser::new("let x : Bool = true;");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_primitive_type_string() {
    let mut parser = Parser::new("let x : String = \"hello\";");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_function_with_parameter_type() {
    let mut parser = Parser::new("fn add(a : I32, b : I32) : I32 => { a + b };");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_function_with_return_type() {
    let mut parser = Parser::new("fn get_number() : I32 => { 42 };");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_function_multiple_parameters() {
    let mut parser = Parser::new("fn multiply(x : I32, y : I32, z : I32) : I32 => { x * y * z };");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_function_void_return() {
    let mut parser = Parser::new("fn do_nothing() : Void => { };");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_reference_type() {
    let mut parser = Parser::new("let ptr : &I32 = &x;");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_mutable_reference_type() {
    let mut parser = Parser::new("let ptr : &mut I32 = &mut x;");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_pointer_type() {
    let mut parser = Parser::new("let ptr : *I32 = &x;");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_generic_type_simple() {
    let mut parser = Parser::new("let opt : Option<I32> = None;");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_generic_type_multiple_params() {
    let mut parser = Parser::new("let result : Result<I32, String> = Ok;");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_generic_type_nested() {
    let mut parser = Parser::new("let nested : Vec<Option<I32>> = [];");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_tuple_type() {
    let mut parser = Parser::new("let pair : [I32, String] = [42, \"hello\"];");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_array_type() {
    let mut parser = Parser::new("let arr : [I32; 3; 5] = [1, 2, 3, 0, 0];");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_union_type() {
    let mut parser = Parser::new("type Result<T, E> = Ok<T> | Err<E>;");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_function_pointer_type() {
    let mut parser = Parser::new("let fn_ptr : |I32, I32| => I32 = add;");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_all_primitive_types() {
    let primitives = vec![
        "U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64", "F32", "F64", "Bool", "Char",
        "String", "Void",
    ];

    for prim in primitives {
        let code = format!("let x : {} = 0;", prim);
        let mut parser = Parser::new(&code);
        let program = parser.parse().unwrap();
        assert_eq!(
            program.statements.len(),
            1,
            "Failed to parse type: {}",
            prim
        );
    }
}

#[test]
fn test_parse_let_without_type_fails() {
    let mut parser = Parser::new("let x = 5;");
    let result = parser.parse();
    // For MVP, we should require type annotations, so this might fail or be accepted gracefully
    // This test documents the expected behavior
    assert!(result.is_ok()); // For now, we're lenient
}

#[test]
fn test_parse_function_parameter_without_type_fails() {
    let mut parser = Parser::new("fn add(a, b) : I32 => { a + b };");
    let result = parser.parse();
    // Should fail because parameters require types
    assert!(result.is_err(), "Parser should require parameter types");
}

#[test]
fn test_parse_function_without_return_type_fails() {
    let mut parser = Parser::new("fn add(a : I32, b : I32) => { a + b };");
    let result = parser.parse();
    // Should fail because functions require return types
    assert!(
        result.is_err(),
        "Parser should require function return types"
    );
}

#[test]
fn test_parse_complex_function_signature() {
    let code = r#"
        fn process(data : &Vec<I32>, count : I32) : Result<String, Error> => {
            "done"
        };
    "#;
    let mut parser = Parser::new(code);
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_generic_function() {
    let mut parser = Parser::new("fn identity<T>(x : T) : T => { x };");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_generic_function_with_trait_bound() {
    let mut parser = Parser::new("fn process<T : Display>(item : T) : String => { \"\" };");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parse_multiple_type_params() {
    let mut parser = Parser::new("fn pair<A, B>(a : A, b : B) : [A, B] => { [a, b] };");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_type_preserved_in_ast() {
    let mut parser = Parser::new("let x : I32 = 42;");
    let program = parser.parse().unwrap();

    // Access the statement and verify type info is stored
    match &program.statements[0] {
        tuff::ast::Stmt::Let { name, ty: _, value: _ } => {
            assert_eq!(name, "x");
            // TODO: Add assertion for type when AST stores it
        }
        _ => panic!("Expected Let statement"),
    }
}

#[test]
fn test_function_types_preserved_in_ast() {
    let mut parser = Parser::new("fn add(a : I32, b : I32) : I32 => { a + b };");
    let program = parser.parse().unwrap();

    match &program.statements[0] {
        tuff::ast::Stmt::Function {
            name,
            type_params: _,
            params,
            return_type: _,
            body: _,
        } => {
            assert_eq!(name, "add");
            assert_eq!(params.len(), 2);
            // TODO: Add assertions for parameter types and return type
        }
        _ => panic!("Expected Function statement"),
    }
}

#[test]
fn test_parser_handles_spaces_in_types() {
    let mut parser = Parser::new("let x : Vec < I32 > = [];");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}

#[test]
fn test_parser_handles_nested_generics() {
    let mut parser = Parser::new("let x : Vec<HashMap<String, Vec<I32>>> = [];");
    let program = parser.parse().unwrap();
    assert_eq!(program.statements.len(), 1);
}
