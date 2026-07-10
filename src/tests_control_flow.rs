use crate::parser::*;

#[test]
fn test_if_else_with_blocks() {
    // Exercises the else branch of parse_if_statement with block bodies
    assert_eq!(
        interpret("let mut x = 0; if (0) { x = 1; } else { x = 42; }; x"),
        Ok(42)
    );
}

#[test]
fn test_if_block_else_single_statement() {
    // Block body for `if`, single-statement body for `else`
    assert_eq!(
        interpret("let mut x = 0; if (false) { x = 3; } else x = 5; x"),
        Ok(5)
    );
}

#[test]
fn test_compound_add_assignment() {
    assert_eq!(interpret("let mut x = 0; x += 1; x"), Ok(1));
}

#[test]
fn test_compound_add_immutable_errors() {
    // Compound assignment on an immutable variable should fail like regular reassignment
    assert!(interpret("let x = 0; x += 1; x").is_err());
}

#[test]
fn test_while_loop_basic() {
    assert_eq!(interpret("let mut x = 0; while (x < 4) x += 1; x"), Ok(4));
}

#[test]
fn test_while_loop_max_iterations_exceeded() {
    // Infinite loop should error after 1024 iterations
    assert!(interpret("let mut x = 0; while (1) x += 1; x").is_err());
}

#[test]
fn test_while_block_body() {
    // Block body exercises parse_block path in eval_while_body_stmt
    assert_eq!(
        interpret("let mut x = 0; while (x < 3) { x += 1; }; x"),
        Ok(3)
    );
}

#[test]
fn test_while_non_assignment_expression_body() {
    // Non-assignment expression body exercises the plain-expression fallback
    // path in eval_while_body_stmt; the condition itself drives termination
    // via an embedded assignment expression.
    assert!(interpret("let mut x = 3; while (x = x - 1) 1; x").is_ok());
}

#[test]
fn test_for_loop_basic() {
    assert_eq!(
        interpret("let mut sum = 0; for (i in 0..4) sum += i; sum"),
        Ok(6)
    );
}

#[test]
fn test_for_loop_block_body() {
    // Block body exercises parse_block path in eval_for_body_stmt
    assert_eq!(
        interpret("let mut s = 0; for (i in 1..3) { s += i * 2; }; s"),
        Ok(6)
    );
}

#[test]
fn test_for_loop_max_iterations_exceeded() {
    // Range exceeding 1024 iterations should error
    assert!(interpret("let mut x = 0; for (i in 0..2000) x += 1; x").is_err());
}

#[test]
fn test_for_loop_expression_body() {
    // Plain expression body exercises the parse_expression fallback path
    assert_eq!(interpret("for (i in 1..3) i + 1; 5"), Ok(5));
}

#[test]
fn test_for_missing_open_paren_errors() {
    assert!(interpret("for").is_err());
}

#[test]
fn test_for_missing_in_keyword_errors() {
    assert!(interpret("for (i 0..4)").is_err());
}

#[test]
fn test_for_missing_range_operator_errors() {
    assert!(interpret("for (i in 0 4) i").is_err());
}

#[test]
fn test_for_missing_close_paren_errors() {
    assert!(interpret("for (i in 0..4 i").is_err());
}

#[test]
fn test_for_loop_range_variable() {
    // Range stored in a variable and reused in for-loop
    assert_eq!(
        interpret("let mut sum = 0; let range = 0..4; for (i in range) sum += i; sum"),
        Ok(6)
    );
}

#[test]
fn test_for_loop_range_variable_max_iterations() {
    // Range variable with huge span should still hit max-iterations guard
    assert!(interpret("let mut x = 0; let r = 0..2000; for (i in r) x += 1; x").is_err());
}

#[test]
fn test_let_range_literal_stored() {
    // Range literal is stored as Value::Range and can be used later;
    // for-loop discards body result so trailing expression gives final value
    assert_eq!(
        interpret("let range = 2..5; for (i in range) i + 1; 9"),
        Ok(9)
    );
}

#[test]
fn test_let_range_shadowed_by_int() {
    // Range variable can be shadowed by a plain int via let
    assert_eq!(interpret("let r = 0..3; let r = 7; r"), Ok(7));
}

#[test]
fn test_for_loop_int_variable_not_range_errors() {
    // Using an integer variable as range should fail (get_range returns None)
    assert!(interpret("let x = 5; for (i in x) i").is_err());
}

#[test]
fn test_match_basic_hit_first_arm() {
    assert_eq!(
        interpret("let x = match (100) { case 100 => 2; case _ => 3; }; x"),
        Ok(2)
    );
}

#[test]
fn test_match_falls_through_to_wildcard() {
    assert_eq!(
        interpret("match (99) { case 100 => 2; case _ => 3; }"),
        Ok(3)
    );
}

#[test]
fn test_match_multiple_arms_hits_second() {
    assert_eq!(
        interpret("match (2) { case 1 => 10; case 2 => 20; case _ => 99; }"),
        Ok(20)
    );
}

#[test]
fn test_match_no_wildcard_unmatched_errors() {
    assert!(interpret("match (5) { case 1 => 10; case 2 => 20; }").is_err());
}

#[test]
fn test_match_missing_open_paren_errors() {
    assert!(interpret("match 5 { case _ => 1; }").is_err());
}

#[test]
fn test_match_missing_close_paren_errors() {
    assert!(interpret("match (5 { case _ => 1; }").is_err());
}

#[test]
fn test_match_missing_open_brace_errors() {
    assert!(interpret("match (5) case _ => 1;").is_err());
}

#[test]
fn test_match_missing_arrow_in_non_wildcard_arm_errors() {
    assert!(interpret("match (1) { case 1; }").is_err());
}

#[test]
fn test_match_missing_arrow_in_case_errors() {
    assert!(interpret("match (5) { case ; case _ => 1; }").is_err());
}

#[test]
fn test_match_missing_close_brace_errors() {
    assert!(interpret("match (5) { case _ => 1").is_err());
}

#[test]
fn test_match_wildcard_missing_arrow_errors() {
    assert!(interpret("match (1) { case _ ; }").is_err());
}

#[test]
fn test_fn_define_and_call() {
    assert_eq!(interpret("fn get() => 100; get()"), Ok(100));
}

#[test]
fn test_fn_with_params_and_args() {
    assert_eq!(
        interpret("fn add(first : I32, second : I32) => first + second; add(25, 75)"),
        Ok(100)
    );
}

#[test]
fn test_fn_with_return_type_annotation() {
    assert_eq!(
        interpret("fn add(first : I32, second : I32) : I32 => first + second; add(25, 75)"),
        Ok(100)
    );
}

#[test]
fn test_fn_with_one_param() {
    assert_eq!(interpret("fn double(x : I32) => x * 2; double(49)"), Ok(98));
}

#[test]
fn test_fn_return_type_missing_token_errors() {
    assert!(interpret("fn f() : ;").is_err());
}

#[test]
fn test_fn_return_type_mismatch_errors() {
    assert!(interpret("fn get() : U8 => 0U16;").is_err());
}

#[test]
fn test_let_with_fn_call_narrower_type_ok() {
    assert_eq!(
        interpret("fn get() : U8 => 100U8; let x : U16 = get(); x"),
        Ok(100)
    );
}

#[test]
fn test_let_with_fn_call_wider_return_type_errors() {
    assert!(interpret("fn get() : U16 => 100U16; let x : U8 = get();").is_err());
}

#[test]
fn test_fn_bool_param_rejects_int_arg() {
    assert!(interpret("fn pass(param : Bool) => 0; pass(100)").is_err());
}

#[test]
fn test_fn_untyped_param_accepts_plain_int() {
    // (None, None) branch: untyped param + plain int arg → Ok
    assert_eq!(interpret("fn foo(x) => x; foo(5)"), Ok(5));
}

#[test]
fn test_fn_untyped_param_accepts_typed_arg() {
    // (_, None) branch: typed arg passed to untyped param → Ok
    assert_eq!(interpret("fn bar(y) => y; bar(10U8)"), Ok(10));
}

#[test]
fn test_fn_param_rejects_wider_type() {
    // (Some(arg_w), Some(expected_w)) if arg_w > expected_w → Err
    assert!(interpret("fn narrow(x : U8) => 0; narrow(100U16)").is_err());
}

#[test]
fn test_yield_in_block() {
    assert_eq!(interpret("{ yield 2; } + 1"), Ok(3));
}

#[test]
fn test_yield_inside_if_in_block() {
    // yield inside an if body should propagate up and terminate the enclosing block
    assert_eq!(interpret("{ if (true) yield 2; 5 } + 1"), Ok(3));
}

#[test]
fn test_yield_inside_else_branch() {
    // yield in else branch when condition is false should also propagate up
    assert_eq!(interpret("{ if (false) 99; else yield 7; } * 2"), Ok(14));
}

#[test]
fn test_return_in_nested_block_terminates_fn() {
    // return inside a nested block terminates the entire function, skipping `inner + 1`
    assert_eq!(
        interpret("fn get() => { let inner = { return 3 }; inner + 1 }; get()"),
        Ok(3)
    );
}

#[test]
fn test_yield_in_nested_block_does_not_terminate_fn() {
    // yield only exits its immediate block, so `inner` is 3 and `inner + 1` evaluates to 4
    assert_eq!(
        interpret("fn get() => { let inner = { yield 3 }; inner + 1 }; get()"),
        Ok(4)
    );
}

#[test]
fn test_return_in_block_expression_subtraction() {
    // return in block with subtraction operator chain (covers parse_additive is_returned break)
    assert_eq!(
        interpret("fn f() => { let x = { return 10 }; x - 5 }; f()"),
        Ok(10)
    );
}

#[test]
fn test_return_in_if_body_block_terminates_fn() {
    // covers parse_if_body block-return path (lines 36-48 in parser_statements)
    assert_eq!(
        interpret("fn f() => { if (true) { return 7; } else 0; 99 }; f()"),
        Ok(7)
    );
}

#[test]
fn test_return_in_if_body_non_block_terminates_fn() {
    // covers parse_if_body non-block return path (lines 45-48)
    assert_eq!(
        interpret("fn f() => { if (true) return 13; else 0; 99 }; f()"),
        Ok(13)
    );
}

#[test]
fn test_multiple_fn_calls_clear_returned_flag() {
    // covers scope.clear_returned being called between function invocations
    assert_eq!(
        interpret("fn a() => { return 5; } fn b() => 20; a(); b()"),
        Ok(20)
    );
}

#[test]
fn test_return_break_in_additive_chain() {
    // covers parse_additive's is_returned break when a returned block is the LHS of `-`
    assert_eq!(interpret("fn f() => { { return 1 } - 5 }; f()"), Ok(1));
}

#[test]
fn test_return_break_in_term_chain() {
    // covers parse_term's is_returned break when a returned block is the LHS of `*`
    assert_eq!(interpret("fn g() => { { return 2 } * 3 }; g()"), Ok(2));
}

#[test]
fn test_return_skip_loop_in_factor_block() {
    // covers the skip-to-`}` loop in parse_factor's block-return path actually iterating
    assert_eq!(interpret("fn h() => { { return 5; 100 } }; h()"), Ok(5));
}

#[test]
fn test_yield_leaves_trailing_tokens_unconsumed_in_block_expr() {
    // yield only exits its immediate statement loop and does not skip to the block's `}`,
    // so trailing tokens before the brace are left for the caller and misparsed.
    assert_eq!(
        interpret("{ yield 3; 100 }"),
        Err("unknown identifier '}'".to_string())
    );
}

#[test]
fn test_return_at_eof_with_no_closing_brace() {
    // covers the EOF branch after the skip-to-`}` loop when input ends without a closing brace
    assert_eq!(interpret("{ return 5"), Ok(5));
}

#[test]
fn test_return_skip_loop_in_if_body_block() {
    // covers the skip-to-`}` loop in parse_if_body's block-return path actually iterating
    assert_eq!(
        interpret("fn k() => { if (true) { return 7; 100 } else 0; 99 }; k()"),
        Ok(7)
    );
}
