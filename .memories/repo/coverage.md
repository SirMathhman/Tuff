# Coverage notes

- Hook requires `cargo llvm-cov --fail-under-lines 95`
- Hard-to-cover lines (OS error paths): `compile_result` `Err(e)` arm (`eprintln!("failed to spawn clang")`), `wait_with_output` `Err(e)` arm (`eprintln!("failed waiting for process")`), and the `main()` wrapper itself
- These 3 locations (10 lines) consistently remain uncovered — this is expected/accepted
- To add coverage, refactor entry points into testable `run(&[String]) -> i32` functions
