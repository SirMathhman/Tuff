#ifndef SAFEC_CODEGEN_H
#define SAFEC_CODEGEN_H

#include "ast.h"
#include <stdio.h>

typedef struct Instantiation
{
	char *generic_name; // e.g., "Wrapper"
	TypeRef *type_args; // e.g., [int]
	char *mangled_name; // e.g., "Wrapper_int"
	struct Instantiation *next;
} Instantiation;

typedef struct
{
	FILE *output;
	Instantiation *struct_instantiations;
	Instantiation *func_instantiations;
	ASTNode *program; // Keep reference for looking up generics
	int indent;
} CodeGen;

void codegen_init(CodeGen *gen, FILE *output, ASTNode *program);
void codegen_generate(CodeGen *gen);
void codegen_generate_header(CodeGen *gen, const char *guard_name);
void codegen_free(CodeGen *gen);

// For generating mangled names
char *mangle_name(const char *base, TypeRef *type_args);

#endif // SAFEC_CODEGEN_H
