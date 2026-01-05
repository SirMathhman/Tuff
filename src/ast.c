#include "ast.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

ASTNode *ast_new_node(ASTNodeType type)
{
	ASTNode *node = (ASTNode *)calloc(1, sizeof(ASTNode));
	if (node)
	{
		node->type = type;
	}
	return node;
}

TypeRef *type_ref_new(const char *name)
{
	TypeRef *ref = (TypeRef *)calloc(1, sizeof(TypeRef));
	if (ref && name)
	{
		ref->name = strdup(name);
	}
	return ref;
}

TypeParam *type_param_new(const char *name)
{
	TypeParam *param = (TypeParam *)calloc(1, sizeof(TypeParam));
	if (param && name)
	{
		param->name = strdup(name);
	}
	return param;
}

TypeRef *type_ref_clone(TypeRef *ref)
{
	if (!ref)
		return NULL;

	TypeRef *clone = type_ref_new(ref->name);
	clone->pointer_level = ref->pointer_level;
	clone->type_args = type_ref_clone(ref->type_args);
	clone->next = type_ref_clone(ref->next);
	return clone;
}

void ast_free_type_ref(TypeRef *ref)
{
	while (ref)
	{
		TypeRef *next = ref->next;
		free(ref->name);
		ast_free_type_ref(ref->type_args);
		free(ref);
		ref = next;
	}
}

void ast_free_type_param(TypeParam *param)
{
	while (param)
	{
		TypeParam *next = param->next;
		free(param->name);
		free(param);
		param = next;
	}
}

void ast_free(ASTNode *node)
{
	while (node)
	{
		ASTNode *next = node->next;

		switch (node->type)
		{
		case AST_STRUCT_DEF:
			free(node->data.struct_def.name);
			ast_free_type_param(node->data.struct_def.type_params);
			ast_free(node->data.struct_def.members);
			break;
		case AST_FUNC_DEF:
		case AST_FUNC_DECL:
			ast_free_type_ref(node->data.func_def.return_type);
			free(node->data.func_def.name);
			ast_free_type_param(node->data.func_def.type_params);
			ast_free(node->data.func_def.params);
			ast_free(node->data.func_def.body);
			break;
		case AST_VAR_DECL:
			ast_free_type_ref(node->data.var_decl.type);
			free(node->data.var_decl.name);
			ast_free(node->data.var_decl.init);
			break;
		case AST_PARAM:
			ast_free_type_ref(node->data.param.type);
			free(node->data.param.name);
			break;
		case AST_BLOCK:
			ast_free(node->data.block.statements);
			break;
		case AST_RETURN:
			ast_free(node->data.ret.value);
			break;
		case AST_IF:
			ast_free(node->data.if_stmt.condition);
			ast_free(node->data.if_stmt.then_branch);
			ast_free(node->data.if_stmt.else_branch);
			break;
		case AST_WHILE:
			ast_free(node->data.while_stmt.condition);
			ast_free(node->data.while_stmt.body);
			break;
		case AST_FOR:
			ast_free(node->data.for_stmt.init);
			ast_free(node->data.for_stmt.condition);
			ast_free(node->data.for_stmt.update);
			ast_free(node->data.for_stmt.body);
			break;
		case AST_BINARY:
			ast_free(node->data.binary.left);
			ast_free(node->data.binary.right);
			break;
		case AST_UNARY:
			ast_free(node->data.unary.operand);
			break;
		case AST_CALL:
			ast_free(node->data.call.callee);
			ast_free_type_ref(node->data.call.type_args);
			ast_free(node->data.call.args);
			break;
		case AST_MEMBER_ACCESS:
			ast_free(node->data.member.object);
			free(node->data.member.member);
			break;
		case AST_ARRAY_ACCESS:
			ast_free(node->data.array_access.array);
			ast_free(node->data.array_access.index);
			break;
		case AST_IDENTIFIER:
			free(node->data.ident.name);
			break;
		case AST_NUMBER:
			free(node->data.number.value);
			break;
		case AST_STRING:
			free(node->data.string.value);
			break;
		case AST_SIZEOF:
			ast_free_type_ref(node->data.size_of.type);
			ast_free(node->data.size_of.expr);
			break;
		case AST_CAST:
			ast_free_type_ref(node->data.cast.type);
			ast_free(node->data.cast.expr);
			break;
		case AST_TYPEDEF:
			ast_free_type_ref(node->data.typedef_stmt.type);
			free(node->data.typedef_stmt.name);
			break;
		case AST_PASSTHROUGH:
			free(node->data.passthrough.code);
			break;
		default:
			break;
		}

		free(node);
		node = next;
	}
}

static void print_indent(int indent)
{
	for (int i = 0; i < indent; i++)
	{
		printf("  ");
	}
}

static void print_type_ref(TypeRef *ref)
{
	if (!ref)
		return;
	printf("%s", ref->name);
	if (ref->type_args)
	{
		printf("<");
		TypeRef *arg = ref->type_args;
		while (arg)
		{
			print_type_ref(arg);
			if (arg->next)
				printf(", ");
			arg = arg->next;
		}
		printf(">");
	}
	for (int i = 0; i < ref->pointer_level; i++)
	{
		printf("*");
	}
}

void ast_print(ASTNode *node, int indent)
{
	while (node)
	{
		print_indent(indent);

		switch (node->type)
		{
		case AST_PROGRAM:
			printf("Program\n");
			break;
		case AST_STRUCT_DEF:
			printf("StructDef: %s", node->data.struct_def.name);
			if (node->data.struct_def.type_params)
			{
				printf("<");
				TypeParam *p = node->data.struct_def.type_params;
				while (p)
				{
					printf("%s", p->name);
					if (p->next)
						printf(", ");
					p = p->next;
				}
				printf(">");
			}
			printf("\n");
			ast_print(node->data.struct_def.members, indent + 1);
			break;
		case AST_FUNC_DEF:
			printf("FuncDef: %s", node->data.func_def.name);
			if (node->data.func_def.type_params)
			{
				printf("<");
				TypeParam *p = node->data.func_def.type_params;
				while (p)
				{
					printf("%s", p->name);
					if (p->next)
						printf(", ");
					p = p->next;
				}
				printf(">");
			}
			printf(" -> ");
			print_type_ref(node->data.func_def.return_type);
			printf("\n");
			ast_print(node->data.func_def.params, indent + 1);
			ast_print(node->data.func_def.body, indent + 1);
			break;
		case AST_VAR_DECL:
			printf("VarDecl: ");
			print_type_ref(node->data.var_decl.type);
			printf(" %s\n", node->data.var_decl.name);
			break;
		case AST_PARAM:
			printf("Param: ");
			print_type_ref(node->data.param.type);
			printf(" %s\n", node->data.param.name);
			break;
		case AST_BLOCK:
			printf("Block\n");
			ast_print(node->data.block.statements, indent + 1);
			break;
		case AST_RETURN:
			printf("Return\n");
			if (node->data.ret.value)
			{
				ast_print(node->data.ret.value, indent + 1);
			}
			break;
		case AST_IDENTIFIER:
			printf("Identifier: %s\n", node->data.ident.name);
			break;
		case AST_NUMBER:
			printf("Number: %s\n", node->data.number.value);
			break;
		case AST_CALL:
			printf("Call\n");
			ast_print(node->data.call.callee, indent + 1);
			break;
		default:
			printf("Node type: %d\n", node->type);
			break;
		}

		node = node->next;
	}
}
