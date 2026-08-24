#ifndef TUFF_AST_H
#define TUFF_AST_H

#include "error.h"

#define TUFF_MAX_STMTS 64
#define TUFF_MAX_NAME 64

typedef enum
{
    NODE_LET,
    NODE_ASSIGN,
    NODE_RETURN
} tuff_node_kind;

typedef struct
{
    tuff_node_kind kind;
    char name[TUFF_MAX_NAME];
    int is_mut;
    long value;  /* NODE_LET: initializer; NODE_RETURN: literal value */
    int use_var; /* NODE_RETURN: value is a variable reference */
    tuff_pos pos;
} tuff_node;

typedef struct
{
    tuff_node stmts[TUFF_MAX_STMTS];
    int count;
    int ret_idx; /* index of the return statement, or -1 */
} tuff_program;

#endif /* TUFF_AST_H */
