#ifndef TUFF_ERROR_H
#define TUFF_ERROR_H

/* Structured error type: what happened, where, and how to fix it. */

typedef enum
{
    ERR_OK = 0,
    ERR_EXPECTED_TOKEN,    /* a required token was missing or unexpected */
    ERR_EXPECTED_INT,      /* an integer literal was required */
    ERR_EXPECTED_IDENT,    /* an identifier was required */
    ERR_EXPECTED_RETURN,   /* the program must end with a return statement */
    ERR_DUPLICATE_VAR,     /* a variable was declared twice */
    ERR_UNDECLARED_VAR,    /* a variable was used before being declared */
    ERR_ASSIGN_IMMUTABLE,  /* a non-mut variable was reassigned */
    ERR_INT_OVERFLOW,      /* an integer literal does not fit in a long */
    ERR_NOT_A_REF,         /* a reference was used where a value was required */
    ERR_REF_NOT_MUT,       /* assignment through a non-mut reference */
    ERR_UNRECOGNIZED_CHAR, /* a character is not part of the grammar */
    ERR_SOURCE_TOO_LONG,   /* the token buffer is exhausted */
    ERR_NAME_TOO_LONG,     /* an identifier or literal exceeds the buffer */
    ERR_PROGRAM_TOO_LONG   /* the statement buffer is exhausted */
} tuff_err;

typedef struct
{
    int line;
    int col;
} tuff_pos;

typedef struct
{
    tuff_err code;
    tuff_pos pos;
} tuff_error;

static inline tuff_error tuff_err_at(tuff_err code, tuff_pos pos)
{
    tuff_error e;
    e.code = code;
    e.pos = pos;
    return e;
}

static inline const char *tuff_err_msg(tuff_err code)
{
    switch (code)
    {
    case ERR_OK:
        return "ok";
    case ERR_EXPECTED_TOKEN:
        return "expected token";
    case ERR_EXPECTED_INT:
        return "expected integer literal";
    case ERR_EXPECTED_IDENT:
        return "expected identifier";
    case ERR_EXPECTED_RETURN:
        return "expected return statement";
    case ERR_DUPLICATE_VAR:
        return "duplicate variable declaration";
    case ERR_UNDECLARED_VAR:
        return "use of undeclared variable";
    case ERR_ASSIGN_IMMUTABLE:
        return "assignment to immutable variable (declare it with 'let mut')";
    case ERR_INT_OVERFLOW:
        return "integer literal out of range";
    case ERR_NOT_A_REF:
        return "value is a reference; dereference it with '*'";
    case ERR_REF_NOT_MUT:
        return "assignment through non-mut reference (declare it with '&mut')";
    case ERR_UNRECOGNIZED_CHAR:
        return "unrecognized character";
    case ERR_SOURCE_TOO_LONG:
        return "source too long (token limit exceeded)";
    case ERR_NAME_TOO_LONG:
        return "identifier or literal too long";
    case ERR_PROGRAM_TOO_LONG:
        return "program too long (statement limit exceeded)";
    }
    return "unknown error";
}

#endif /* TUFF_ERROR_H */
