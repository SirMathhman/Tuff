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
    int deref;       /* NODE_RETURN: value is *name; NODE_ASSIGN: target is *name */
    int block_first; /* NODE_BLOCK: index of first statement in the block */
    int block_count; /* NODE_BLOCK: number of statements in the block */
    int block_ret;   /* NODE_BLOCK: index of the block's return, or -1 */
    tuff_pos pos;
} tuff_node;

typedef struct
{
    tuff_node stmts[TUFF_MAX_STMTS];
    int count;
    int ret_idx; /* index of the return statement, or -1 */
} tuff_program;

#endif /* TUFF_AST_H */
