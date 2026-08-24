#ifndef TUFF_AST_H
#define TUFF_AST_H

#include "error.h"

#define TUFF_MAX_STMTS 64
#define TUFF_MAX_NAME 64

typedef enum
{
    NODE_LET,
    NODE_ASSIGN,
    NODE_RETURN,
    NODE_BLOCK
} tuff_node_kind;

typedef enum
{
    TUFF_OP_OR,
    TUFF_OP_AND
} tuff_op;

typedef enum
{
    OPKND_LITERAL,
    OPKND_VAR
} tuff_opknd;

/* Payload for a NODE_LET statement. */
typedef struct
{
    char name[TUFF_MAX_NAME];
    int is_mut;
    long value;
    int is_ref;
    int ref_mut;
    char ref_name[TUFF_MAX_NAME];
} tuff_let;

/* Payload for a NODE_ASSIGN statement. */
typedef struct
{
    char name[TUFF_MAX_NAME];
    int deref;
    long value;
} tuff_assign;

/* An operand of a binary expression: a literal or a variable. */
typedef struct
{
    tuff_opknd kind;
    long value;
    char name[TUFF_MAX_NAME];
} tuff_operand;

/* Payload for a NODE_RETURN statement. A simple value uses is_var/deref/name
 * (with the literal value in op1); a binary expression uses binop/op/op1/op2. */
typedef struct
{
    int is_var;
    int deref;
    char name[TUFF_MAX_NAME];
    int binop;
    tuff_op op;
    tuff_operand op1;
    tuff_operand op2;
} tuff_return;

/* Payload for a NODE_BLOCK statement. */
typedef struct
{
    int first; /* index of first statement in the block */
    int count; /* number of statements in the block */
    int ret;   /* index of the block's return, or -1 */
} tuff_block;

typedef struct
{
    tuff_node_kind kind;
    union
    {
        tuff_let let;
        tuff_assign assign;
        tuff_return ret;
        tuff_block block;
    } as;
    tuff_pos pos;
} tuff_node;

typedef struct
{
    tuff_node stmts[TUFF_MAX_STMTS];
    int count;
    int ret_idx; /* index of the return statement, or -1 */
} tuff_program;

#endif /* TUFF_AST_H */
