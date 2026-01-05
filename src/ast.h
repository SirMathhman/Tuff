#ifndef SAFEC_AST_H
#define SAFEC_AST_H

#include <stddef.h>

// Forward declarations
typedef struct ASTNode ASTNode;
typedef struct TypeParam TypeParam;
typedef struct TypeRef TypeRef;

// Type parameter: T, K, V, etc.
typedef struct TypeParam
{
	char *name;
	struct TypeParam *next;
} TypeParam;

// Type reference with optional type arguments
typedef struct TypeRef
{
	char *name;								 // e.g., "int", "Wrapper", "T"
	struct TypeRef *type_args; // for Wrapper<int> -> type_args points to "int"
	int pointer_level;				 // number of *
	struct TypeRef *next;			 // for comma-separated type args
} TypeRef;

// AST Node types
typedef enum
{
	AST_PROGRAM,
	AST_STRUCT_DEF,
	AST_FUNC_DEF,
	AST_FUNC_DECL,
	AST_VAR_DECL,
	AST_PARAM,
	AST_BLOCK,
	AST_RETURN,
	AST_IF,
	AST_WHILE,
	AST_FOR,
	AST_EXPR_STMT,
	AST_BINARY,
	AST_UNARY,
	AST_CALL,
	AST_MEMBER_ACCESS,
	AST_ARRAY_ACCESS,
	AST_IDENTIFIER,
	AST_NUMBER,
	AST_STRING,
	AST_CHAR,
	AST_SIZEOF,
	AST_CAST,
	AST_TYPEDEF,
	AST_ENUM_DEF,
	AST_INCLUDE,		// #include "path"
	AST_PASSTHROUGH // Raw C code to pass through
} ASTNodeType;

// Struct definition: struct Name<T, U> { ... };
typedef struct
{
	char *name;
	TypeParam *type_params; // NULL for non-generic structs
	ASTNode *members;				// linked list of VAR_DECL
} StructDef;

// Function definition/declaration
typedef struct
{
	TypeRef *return_type;
	char *name;
	TypeParam *type_params; // NULL for non-generic functions
	ASTNode *params;				// linked list of PARAM
	ASTNode *body;					// NULL for declarations, BLOCK for definitions
} FuncDef;

// Variable declaration
typedef struct
{
	TypeRef *type;
	char *name;
	ASTNode *init; // optional initializer
} VarDecl;

// Parameter
typedef struct
{
	TypeRef *type;
	char *name;
} Param;

// Block statement
typedef struct
{
	ASTNode *statements; // linked list
} Block;

// Return statement
typedef struct
{
	ASTNode *value; // can be NULL
} Return;

// If statement
typedef struct
{
	ASTNode *condition;
	ASTNode *then_branch;
	ASTNode *else_branch; // can be NULL
} If;

// While statement
typedef struct
{
	ASTNode *condition;
	ASTNode *body;
} While;

// For statement
typedef struct
{
	ASTNode *init;
	ASTNode *condition;
	ASTNode *update;
	ASTNode *body;
} For;

// Binary expression
typedef struct
{
	int op; // TokenType
	ASTNode *left;
	ASTNode *right;
} Binary;

// Unary expression
typedef struct
{
	int op;
	ASTNode *operand;
	int prefix; // 1 for prefix, 0 for postfix
} Unary;

// Function call
typedef struct
{
	ASTNode *callee;
	TypeRef *type_args; // for generic calls: func<int>(x)
	ASTNode *args;			// linked list
} Call;

// Member access: a.b or a->b
typedef struct
{
	ASTNode *object;
	char *member;
	int is_arrow;
} MemberAccess;

// Array access: a[i]
typedef struct
{
	ASTNode *array;
	ASTNode *index;
} ArrayAccess;

// Identifier
typedef struct
{
	char *name;
} Identifier;

// Number literal
typedef struct
{
	char *value; // Keep as string for preservation
} Number;

// String literal
typedef struct
{
	char *value;
} String;

// Sizeof expression
typedef struct
{
	TypeRef *type; // sizeof(type)
	ASTNode *expr; // sizeof(expr) - one of these is set
} Sizeof;

// Cast expression
typedef struct
{
	TypeRef *type;
	ASTNode *expr;
} Cast;

// Typedef
typedef struct
{
	TypeRef *type;
	char *name;
} Typedef;

// Passthrough (raw C code)
typedef struct
{
	char *code;
} Passthrough;

// Include directive
typedef struct
{
	char *path;		 // The path in the include
	int is_system; // 1 for <...>, 0 for "..."
} Include;

// Main AST node structure
struct ASTNode
{
	ASTNodeType type;
	int line;
	int column;
	struct ASTNode *next; // for linked lists

	union
	{
		StructDef struct_def;
		FuncDef func_def;
		VarDecl var_decl;
		Param param;
		Block block;
		Return ret;
		If if_stmt;
		While while_stmt;
		For for_stmt;
		Binary binary;
		Unary unary;
		Call call;
		MemberAccess member;
		ArrayAccess array_access;
		Identifier ident;
		Number number;
		String string;
		Sizeof size_of;
		Cast cast;
		Typedef typedef_stmt;
		Passthrough passthrough;
		Include include;
	} data;
};

// Memory management
ASTNode *ast_new_node(ASTNodeType type);
void ast_free(ASTNode *node);
void ast_free_type_ref(TypeRef *ref);
void ast_free_type_param(TypeParam *param);

// Type utilities
TypeRef *type_ref_new(const char *name);
TypeParam *type_param_new(const char *name);
TypeRef *type_ref_clone(TypeRef *ref);

// Debug
void ast_print(ASTNode *node, int indent);

#endif // SAFEC_AST_H
