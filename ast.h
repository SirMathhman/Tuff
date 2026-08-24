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
    TUFF_OP_OR
} tuff_op;

typedef enum
{
    OPKND_LITERAL,
    OPKND_VAR
} tuff_opknd;

typedef struct
{
    tuff_node_kind kind;
    char name[TUFF_MAX_NAME];
    int is_mut;
    long value;  /* NODE_LET: initializer; NODE_RETURN: literal value */
    int use_var; /* NODE_RETURN: value is a variable reference */
    int is_ref;  /* NODE_LET: initializer is &ref_name */
    int ref_mut; /* NODE_LET: reference is &mut */
    char ref_name[TUFF_MAX_NAME];
    int deref;                    /* NODE_RETURN: value is *name; NODE_ASSIGN: target is *name */
    int binop;                    /* NODE_RETURN: value is a binary expression */
    tuff_op op;                   /* NODE_RETURN: binary operator */
    tuff_opknd op1_kind;          /* NODE_RETURN: kind of the left operand */
    long op1_value;               /* NODE_RETURN: left operand literal value */
    char op1_name[TUFF_MAX_NAME]; /* NODE_RETURN: left operand variable name */
    tuff_opknd op2_kind;          /* NODE_RETURN: kind of the right operand */
    long op2_value;               /* NODE_RETURN: right operand literal value */
    char op2_name[TUFF_MAX_NAME]; /* NODE_RETURN: right operand variable name */
    int block_first;              /* NODE_BLOCK: index of first statement in the block */
    int block_count;              /* NODE_BLOCK: number of statements in the block */
    int block_ret;                /* NODE_BLOCK: index of the block's return, or -1 */
    tuff_pos pos;
} tuff_node;

typedef struct
{
    tuff_node stmts[TUFF_MAX_STMTS];
    int count;
    int ret_idx; /* index of the return statement, or -1 */
} tuff_program;

#endif /* TUFF_AST_H */
