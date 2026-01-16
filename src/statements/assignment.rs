use crate::parse_context::ParseEnvContextMut;
use crate::parse_utils::{parse_identifier, skip_whitespace};
use crate::variables::{is_type_compatible, Environment, VariableInfo};

pub fn expect_semicolon(input: &str, pos: &mut usize) -> Result<(), String> {
    skip_whitespace(input, pos);
    if !input[*pos..].trim_start().starts_with(';') {
        return Err("Expected ';'".to_string());
    }
    *pos += 1;
    Ok(())
}

pub fn parse_value_or_reference(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(i32, String, Option<String>), String> {
    if input[*pos..].trim_start().starts_with('&') {
        let trimmed = input[*pos..].trim_start();
        let ws_offset = input[*pos..].len() - trimmed.len();
        *pos += ws_offset + 1;
        skip_whitespace(input, pos);

        // Check for &mut
        let is_mutable_ref = if input[*pos..].trim_start().starts_with("mut ") {
            skip_whitespace(input, pos);
            *pos += 4;
            skip_whitespace(input, pos);
            true
        } else {
            false
        };

        let (ref_var_name, len) = parse_identifier(&input[*pos..])?;
        *pos += len;
        let ref_type = crate::pointers::resolve_reference(&ref_var_name, env, is_mutable_ref)?;
        Ok((0, ref_type, Some(ref_var_name)))
    } else {
        let (val, ty) = crate::parser::parse_term_with_type(input, pos, env)?;
        Ok((val, ty, None))
    }
}

struct UpdateMutableVarArgs {
    var_name: String,
    var_info: VariableInfo,
    new_val: i32,
    new_type: String,
    points_to: Option<String>,
}

fn update_mutable_var(env: &mut Environment, args: UpdateMutableVarArgs) -> Result<(), String> {
    if !is_type_compatible(&args.var_info.type_name, &args.new_type) {
        return Err(format!(
            "Type mismatch in assignment to '{}': declared type '{}' but got '{}'",
            args.var_name, args.var_info.type_name, args.new_type
        ));
    }

    // If variable was uninitialized (None), make it immutable after first assignment
    let new_mutability = args.var_info.value.is_some();

    env.insert(
        args.var_name,
        VariableInfo {
            value: Some(args.new_val),
            type_name: args.var_info.type_name,
            is_mutable: new_mutability,
            points_to: args.points_to,
            struct_fields: args.var_info.struct_fields,
            function_name: None,
            local_function: None,
            methods: None,
        },
    );
    Ok(())
}

struct DerefAssignmentInput<'a> {
    trimmed: &'a str,
    ws_offset: usize,
}

fn try_parse_dereference_assignment(
    ctx: &mut ParseEnvContextMut,
    args: DerefAssignmentInput,
) -> Result<bool, String> {
    if let Some(after_star) = args.trimmed.strip_prefix('*') {
        let after_star_trimmed = after_star.trim_start();

        // Only proceed if it looks like it could be a dereference assignment
        if after_star_trimmed
            .chars()
            .next()
            .is_some_and(|c| c.is_alphabetic() || c == '_')
        {
            // Look ahead to see if there's an = after the identifier
            let (potential_var, var_len) = parse_identifier(after_star_trimmed)?;
            let after_var = &after_star_trimmed[var_len..];
            let after_var_trimmed = after_var.trim_start();

            if after_var_trimmed.starts_with('=') {
                // This is a dereference assignment
                *ctx.pos += args.ws_offset + 1; // skip *
                skip_whitespace(ctx.input, ctx.pos);
                *ctx.pos += after_star_trimmed.len() - after_var_trimmed.len(); // skip var
                skip_whitespace(ctx.input, ctx.pos);

                skip_whitespace(ctx.input, ctx.pos);
                if !ctx.input[*ctx.pos..].trim_start().starts_with('=') {
                    return Err("Expected '=' in dereference assignment".to_string());
                }
                *ctx.pos += 1;
                skip_whitespace(ctx.input, ctx.pos);

                let (val, _actual_type, _) =
                    parse_value_or_reference(ctx.input, ctx.pos, ctx.env)?;

                // Update the pointed variable through the pointer
                crate::pointers::assign_through_pointer(&potential_var, val, ctx.env)?;

                expect_semicolon(ctx.input, ctx.pos)?;
                return Ok(true);
            }
        }
    }
    Ok(false)
}

struct CompoundAssignmentArgs {
    op: char,
    var_name: String,
    var_info: VariableInfo,
}

fn execute_compound_assignment(
    ctx: &mut ParseEnvContextMut,
    args: CompoundAssignmentArgs,
) -> Result<(), String> {
    if !ctx.input[*ctx.pos..].trim_start().starts_with(&format!("{}=", args.op)) {
        return Err(format!("Expected '{}='", args.op));
    }
    *ctx.pos += ctx.input[*ctx.pos..].len() - ctx.input[*ctx.pos..].trim_start().len() + 2;
    skip_whitespace(ctx.input, ctx.pos);

    let (rhs_val, actual_type, _) = parse_value_or_reference(ctx.input, ctx.pos, ctx.env)?;
    let lhs_val = args
        .var_info
        .value
        .ok_or_else(|| format!("Variable '{}' is not initialized", args.var_name))?;
    let result = match args.op {
        '+' => lhs_val + rhs_val,
        '-' => lhs_val - rhs_val,
        '*' => lhs_val * rhs_val,
        '/' => {
            if rhs_val == 0 {
                return Err("Division by zero".to_string());
            } else {
                lhs_val / rhs_val
            }
        }
        _ => return Err(format!("Unknown operator: {}", args.op)),
    };

    update_mutable_var(
        ctx.env,
        UpdateMutableVarArgs {
            var_name: args.var_name,
            var_info: args.var_info,
            new_val: result,
            new_type: actual_type,
            points_to: None,
        },
    )?;
    Ok(())
}

// Note: function is at 56 lines due to complex compound assignment parsing logic
#[allow(clippy::too_many_lines)]
pub fn parse_assignment_statement(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<bool, String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    let ws_offset = rest.len() - trimmed.len();

    if try_parse_dereference_assignment(
        &mut ParseEnvContextMut { input, pos, env },
        DerefAssignmentInput { trimmed, ws_offset },
    )? {
        return Ok(true);
    }
    if let Some(after_this) = trimmed.strip_prefix("this.") {
        if let Ok((var_name, var_len)) = parse_identifier(after_this) {
            if after_this[var_len..].trim_start().starts_with('=') {
                *pos += ws_offset + 5 + var_len;
                skip_whitespace(input, pos);
                *pos += 1;
                skip_whitespace(input, pos);
                let vi = env
                    .get(&var_name)
                    .ok_or(format!("Undefined: {}", var_name))?
                    .clone();
                if !vi.is_mutable {
                    return Err(format!("Cannot assign to immutable '{}'", var_name));
                }
                let (val, ty, pts) = parse_value_or_reference(input, pos, env)?;
                update_mutable_var(
                    env,
                    UpdateMutableVarArgs {
                        var_name,
                        var_info: vi,
                        new_val: val,
                        new_type: ty,
                        points_to: pts,
                    },
                )?;
                skip_whitespace(input, pos);
                if !input[*pos..].trim_start().starts_with(';') {
                    return Err("Expected ';'".to_string());
                }
                *pos += input[*pos..].len() - input[*pos..].trim_start().len() + 1;
                return Ok(true);
            }
        }
    }

    if !trimmed
        .chars()
        .next()
        .is_some_and(|c| c.is_alphabetic() || c == '_')
    {
        return Ok(false);
    }
    let (potential_var, var_len) = parse_identifier(trimmed)?;
    let after_var = &trimmed[var_len..];
    let after_var_trimmed = after_var.trim_start();
    let compound_op = if after_var_trimmed.starts_with("+=") {
        Some('+')
    } else if after_var_trimmed.starts_with("-=") {
        Some('-')
    } else if after_var_trimmed.starts_with("*=") {
        Some('*')
    } else if after_var_trimmed.starts_with("/=") {
        Some('/')
    } else {
        None
    };
    if compound_op.is_none() && !after_var_trimmed.starts_with('=') {
        return Ok(false);
    }

    *pos += ws_offset + var_len;
    let var_name = potential_var;
    let var_info = env
        .get(&var_name)
        .ok_or_else(|| format!("Undefined variable: {}", var_name))?
        .clone();
    if !var_info.is_mutable {
        return Err(format!(
            "Cannot assign to immutable variable '{}'",
            var_name
        ));
    }
    skip_whitespace(input, pos);
    if let Some(op) = compound_op {
        execute_compound_assignment(
            &mut ParseEnvContextMut { input, pos, env },
            CompoundAssignmentArgs {
                op,
                var_name,
                var_info,
            },
        )?;
    } else {
        if !input[*pos..].trim_start().starts_with('=') {
            return Err("Expected '=' in assignment".to_string());
        }
        *pos += 1;
        skip_whitespace(input, pos);
        let (val, actual_type, points_to) = parse_value_or_reference(input, pos, env)?;
        update_mutable_var(
            env,
            UpdateMutableVarArgs {
                var_name,
                var_info,
                new_val: val,
                new_type: actual_type,
                points_to,
            },
        )?;
    }

    expect_semicolon(input, pos)?;
    Ok(true)
}
