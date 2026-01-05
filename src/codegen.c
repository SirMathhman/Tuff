#include "codegen.h"
#include "lexer.h"
#include <stdlib.h>
#include <string.h>

void codegen_init(CodeGen *gen, FILE *output, ASTNode *program)
{
	gen->output = output;
	gen->struct_instantiations = NULL;
	gen->func_instantiations = NULL;
	gen->program = program;
	gen->indent = 0;
}

static void free_instantiations(Instantiation *inst)
{
	while (inst)
	{
		Instantiation *next = inst->next;
		free(inst->generic_name);
		ast_free_type_ref(inst->type_args);
		free(inst->mangled_name);
		free(inst);
		inst = next;
	}
}

void codegen_free(CodeGen *gen)
{
	free_instantiations(gen->struct_instantiations);
	free_instantiations(gen->func_instantiations);
}

static void emit(CodeGen *gen, const char *str)
{
	fprintf(gen->output, "%s", str);
}

static void emit_indent(CodeGen *gen)
{
	for (int i = 0; i < gen->indent; i++)
	{
		fprintf(gen->output, "    ");
	}
}

static void emit_newline(CodeGen *gen)
{
	fprintf(gen->output, "\n");
}

// Generate mangled name from generic name and type arguments
char *mangle_name(const char *base, TypeRef *type_args)
{
	if (!type_args)
	{
		return strdup(base);
	}

	// Calculate required length
	size_t len = strlen(base);
	TypeRef *arg = type_args;
	while (arg)
	{
		len += 1 + strlen(arg->name); // _TypeName
		for (int i = 0; i < arg->pointer_level; i++)
		{
			len += 3; // _ptr
		}
		arg = arg->next;
	}

	char *result = (char *)malloc(len + 1);
	strcpy(result, base);

	arg = type_args;
	while (arg)
	{
		strcat(result, "_");
		strcat(result, arg->name);
		for (int i = 0; i < arg->pointer_level; i++)
		{
			strcat(result, "_ptr");
		}
		arg = arg->next;
	}

	return result;
}

// Check if an instantiation already exists
static Instantiation *find_instantiation(Instantiation *list, const char *name, TypeRef *args)
{
	while (list)
	{
		if (strcmp(list->generic_name, name) == 0)
		{
			// Compare type arguments
			TypeRef *a1 = list->type_args;
			TypeRef *a2 = args;
			int match = 1;
			while (a1 && a2)
			{
				if (strcmp(a1->name, a2->name) != 0 || a1->pointer_level != a2->pointer_level)
				{
					match = 0;
					break;
				}
				a1 = a1->next;
				a2 = a2->next;
			}
			if (match && !a1 && !a2)
			{
				return list;
			}
		}
		list = list->next;
	}
	return NULL;
}

// Add an instantiation to the list
static Instantiation *add_instantiation(Instantiation **list, const char *name, TypeRef *args)
{
	Instantiation *existing = find_instantiation(*list, name, args);
	if (existing)
		return existing;

	Instantiation *inst = (Instantiation *)calloc(1, sizeof(Instantiation));
	inst->generic_name = strdup(name);
	inst->type_args = type_ref_clone(args);
	inst->mangled_name = mangle_name(name, args);
	inst->next = *list;
	*list = inst;
	return inst;
}

// Find a struct definition by name
static ASTNode *find_struct_def(ASTNode *program, const char *name)
{
	ASTNode *decl = program->data.block.statements;
	while (decl)
	{
		if (decl->type == AST_STRUCT_DEF && strcmp(decl->data.struct_def.name, name) == 0)
		{
			return decl;
		}
		decl = decl->next;
	}
	return NULL;
}

// Find a function definition by name
static ASTNode *find_func_def(ASTNode *program, const char *name)
{
	ASTNode *decl = program->data.block.statements;
	while (decl)
	{
		if (decl->type == AST_FUNC_DEF && strcmp(decl->data.func_def.name, name) == 0)
		{
			return decl;
		}
		decl = decl->next;
	}
	return NULL;
}

// Build substitution map from type params to type args
typedef struct TypeSubst
{
	char *param_name;
	TypeRef *arg_type;
	struct TypeSubst *next;
} TypeSubst;

static TypeSubst *build_subst(TypeParam *params, TypeRef *args)
{
	TypeSubst *head = NULL;
	TypeSubst *tail = NULL;

	while (params && args)
	{
		TypeSubst *subst = (TypeSubst *)calloc(1, sizeof(TypeSubst));
		subst->param_name = strdup(params->name);
		subst->arg_type = type_ref_clone(args);

		if (!head)
		{
			head = subst;
			tail = subst;
		}
		else
		{
			tail->next = subst;
			tail = subst;
		}

		params = params->next;
		args = args->next;
	}

	return head;
}

static void free_subst(TypeSubst *subst)
{
	while (subst)
	{
		TypeSubst *next = subst->next;
		free(subst->param_name);
		ast_free_type_ref(subst->arg_type);
		free(subst);
		subst = next;
	}
}

static TypeRef *apply_subst(TypeSubst *subst, TypeRef *type)
{
	if (!type)
		return NULL;

	// Check if this type name matches a type parameter
	TypeSubst *s = subst;
	while (s)
	{
		if (strcmp(s->param_name, type->name) == 0)
		{
			TypeRef *result = type_ref_clone(s->arg_type);
			result->pointer_level += type->pointer_level;
			return result;
		}
		s = s->next;
	}

	// Not a type parameter, clone it
	TypeRef *result = type_ref_new(type->name);
	result->pointer_level = type->pointer_level;
	result->type_args = apply_subst(subst, type->type_args);
	return result;
}

// Forward declarations
static void emit_type(CodeGen *gen, TypeRef *type, TypeSubst *subst);
static void emit_expression(CodeGen *gen, ASTNode *node, TypeSubst *subst);
static void emit_statement(CodeGen *gen, ASTNode *node, TypeSubst *subst);

static void emit_type(CodeGen *gen, TypeRef *type, TypeSubst *subst)
{
	if (!type)
		return;

	// Apply substitution
	TypeRef *resolved = apply_subst(subst, type);

	// Check if this is a generic type that needs instantiation
	if (resolved->type_args)
	{
		// Find the struct and add instantiation
		ASTNode *struct_def = find_struct_def(gen->program, resolved->name);
		if (struct_def && struct_def->data.struct_def.type_params)
		{
			Instantiation *inst = add_instantiation(&gen->struct_instantiations,
																							resolved->name, resolved->type_args);
			emit(gen, inst->mangled_name);
		}
		else
		{
			emit(gen, resolved->name);
		}
	}
	else
	{
		emit(gen, resolved->name);
	}

	for (int i = 0; i < resolved->pointer_level; i++)
	{
		emit(gen, "*");
	}

	ast_free_type_ref(resolved);
}

static void emit_expression(CodeGen *gen, ASTNode *node, TypeSubst *subst)
{
	if (!node)
		return;

	switch (node->type)
	{
	case AST_NUMBER:
		emit(gen, node->data.number.value);
		break;

	case AST_STRING:
		emit(gen, node->data.string.value);
		break;

	case AST_CHAR:
		emit(gen, node->data.string.value);
		break;

	case AST_IDENTIFIER:
		emit(gen, node->data.ident.name);
		break;

	case AST_BINARY:
		emit(gen, "(");
		emit_expression(gen, node->data.binary.left, subst);
		switch (node->data.binary.op)
		{
		case TOK_PLUS:
			emit(gen, " + ");
			break;
		case TOK_MINUS:
			emit(gen, " - ");
			break;
		case TOK_STAR:
			emit(gen, " * ");
			break;
		case TOK_SLASH:
			emit(gen, " / ");
			break;
		case TOK_PERCENT:
			emit(gen, " % ");
			break;
		case TOK_EQ:
			emit(gen, " == ");
			break;
		case TOK_NE:
			emit(gen, " != ");
			break;
		case TOK_LT:
			emit(gen, " < ");
			break;
		case TOK_GT:
			emit(gen, " > ");
			break;
		case TOK_LE:
			emit(gen, " <= ");
			break;
		case TOK_GE:
			emit(gen, " >= ");
			break;
		case TOK_AND:
			emit(gen, " && ");
			break;
		case TOK_OR:
			emit(gen, " || ");
			break;
		case TOK_AMPERSAND:
			emit(gen, " & ");
			break;
		case TOK_PIPE:
			emit(gen, " | ");
			break;
		case TOK_CARET:
			emit(gen, " ^ ");
			break;
		case TOK_LSHIFT:
			emit(gen, " << ");
			break;
		case TOK_RSHIFT:
			emit(gen, " >> ");
			break;
		case TOK_ASSIGN:
			emit(gen, " = ");
			break;
		case TOK_PLUS_ASSIGN:
			emit(gen, " += ");
			break;
		case TOK_MINUS_ASSIGN:
			emit(gen, " -= ");
			break;
		case TOK_STAR_ASSIGN:
			emit(gen, " *= ");
			break;
		case TOK_SLASH_ASSIGN:
			emit(gen, " /= ");
			break;
		default:
			emit(gen, " ? ");
			break;
		}
		emit_expression(gen, node->data.binary.right, subst);
		emit(gen, ")");
		break;

	case AST_UNARY:
		if (node->data.unary.prefix)
		{
			switch (node->data.unary.op)
			{
			case TOK_MINUS:
				emit(gen, "-");
				break;
			case TOK_EXCLAIM:
				emit(gen, "!");
				break;
			case TOK_TILDE:
				emit(gen, "~");
				break;
			case TOK_AMPERSAND:
				emit(gen, "&");
				break;
			case TOK_STAR:
				emit(gen, "*");
				break;
			case TOK_INC:
				emit(gen, "++");
				break;
			case TOK_DEC:
				emit(gen, "--");
				break;
			default:
				break;
			}
			emit_expression(gen, node->data.unary.operand, subst);
		}
		else
		{
			emit_expression(gen, node->data.unary.operand, subst);
			switch (node->data.unary.op)
			{
			case TOK_INC:
				emit(gen, "++");
				break;
			case TOK_DEC:
				emit(gen, "--");
				break;
			default:
				break;
			}
		}
		break;

	case AST_CALL:
	{
		// Check if this is a generic function call
		if (node->data.call.type_args && node->data.call.callee->type == AST_IDENTIFIER)
		{
			char *func_name = node->data.call.callee->data.ident.name;
			ASTNode *func_def = find_func_def(gen->program, func_name);

			if (func_def && func_def->data.func_def.type_params)
			{
				Instantiation *inst = add_instantiation(&gen->func_instantiations,
																								func_name, node->data.call.type_args);
				emit(gen, inst->mangled_name);
			}
			else
			{
				emit_expression(gen, node->data.call.callee, subst);
			}
		}
		else
		{
			emit_expression(gen, node->data.call.callee, subst);
		}

		emit(gen, "(");
		ASTNode *arg = node->data.call.args;
		while (arg)
		{
			emit_expression(gen, arg, subst);
			if (arg->next)
				emit(gen, ", ");
			arg = arg->next;
		}
		emit(gen, ")");
		break;
	}

	case AST_MEMBER_ACCESS:
		emit_expression(gen, node->data.member.object, subst);
		emit(gen, node->data.member.is_arrow ? "->" : ".");
		emit(gen, node->data.member.member);
		break;

	case AST_ARRAY_ACCESS:
		emit_expression(gen, node->data.array_access.array, subst);
		emit(gen, "[");
		emit_expression(gen, node->data.array_access.index, subst);
		emit(gen, "]");
		break;

	case AST_SIZEOF:
		emit(gen, "sizeof(");
		if (node->data.size_of.type)
		{
			emit_type(gen, node->data.size_of.type, subst);
		}
		else
		{
			emit_expression(gen, node->data.size_of.expr, subst);
		}
		emit(gen, ")");
		break;

	case AST_CAST:
		emit(gen, "(");
		emit_type(gen, node->data.cast.type, subst);
		emit(gen, ")");
		emit_expression(gen, node->data.cast.expr, subst);
		break;

	case AST_IF:
		// Ternary expression
		emit(gen, "(");
		emit_expression(gen, node->data.if_stmt.condition, subst);
		emit(gen, " ? ");
		emit_expression(gen, node->data.if_stmt.then_branch, subst);
		emit(gen, " : ");
		emit_expression(gen, node->data.if_stmt.else_branch, subst);
		emit(gen, ")");
		break;

	default:
		break;
	}
}

static void emit_statement(CodeGen *gen, ASTNode *node, TypeSubst *subst)
{
	if (!node)
		return;

	switch (node->type)
	{
	case AST_BLOCK:
		emit(gen, "{\n");
		gen->indent++;
		{
			ASTNode *stmt = node->data.block.statements;
			while (stmt)
			{
				emit_statement(gen, stmt, subst);
				stmt = stmt->next;
			}
		}
		gen->indent--;
		emit_indent(gen);
		emit(gen, "}");
		break;

	case AST_RETURN:
		emit_indent(gen);
		emit(gen, "return");
		if (node->data.ret.value)
		{
			emit(gen, " ");
			emit_expression(gen, node->data.ret.value, subst);
		}
		emit(gen, ";\n");
		break;

	case AST_IF:
		emit_indent(gen);
		emit(gen, "if (");
		emit_expression(gen, node->data.if_stmt.condition, subst);
		emit(gen, ") ");
		if (node->data.if_stmt.then_branch->type == AST_BLOCK)
		{
			emit_statement(gen, node->data.if_stmt.then_branch, subst);
		}
		else
		{
			emit(gen, "{\n");
			gen->indent++;
			emit_statement(gen, node->data.if_stmt.then_branch, subst);
			gen->indent--;
			emit_indent(gen);
			emit(gen, "}");
		}
		if (node->data.if_stmt.else_branch)
		{
			emit(gen, " else ");
			if (node->data.if_stmt.else_branch->type == AST_BLOCK ||
					node->data.if_stmt.else_branch->type == AST_IF)
			{
				emit_statement(gen, node->data.if_stmt.else_branch, subst);
			}
			else
			{
				emit(gen, "{\n");
				gen->indent++;
				emit_statement(gen, node->data.if_stmt.else_branch, subst);
				gen->indent--;
				emit_indent(gen);
				emit(gen, "}");
			}
		}
		emit_newline(gen);
		break;

	case AST_WHILE:
		emit_indent(gen);
		emit(gen, "while (");
		emit_expression(gen, node->data.while_stmt.condition, subst);
		emit(gen, ") ");
		if (node->data.while_stmt.body->type == AST_BLOCK)
		{
			emit_statement(gen, node->data.while_stmt.body, subst);
		}
		else
		{
			emit(gen, "{\n");
			gen->indent++;
			emit_statement(gen, node->data.while_stmt.body, subst);
			gen->indent--;
			emit_indent(gen);
			emit(gen, "}");
		}
		emit_newline(gen);
		break;

	case AST_FOR:
		emit_indent(gen);
		emit(gen, "for (");
		if (node->data.for_stmt.init)
		{
			emit_expression(gen, node->data.for_stmt.init, subst);
		}
		emit(gen, "; ");
		if (node->data.for_stmt.condition)
		{
			emit_expression(gen, node->data.for_stmt.condition, subst);
		}
		emit(gen, "; ");
		if (node->data.for_stmt.update)
		{
			emit_expression(gen, node->data.for_stmt.update, subst);
		}
		emit(gen, ") ");
		if (node->data.for_stmt.body->type == AST_BLOCK)
		{
			emit_statement(gen, node->data.for_stmt.body, subst);
		}
		else
		{
			emit(gen, "{\n");
			gen->indent++;
			emit_statement(gen, node->data.for_stmt.body, subst);
			gen->indent--;
			emit_indent(gen);
			emit(gen, "}");
		}
		emit_newline(gen);
		break;

	case AST_VAR_DECL:
		emit_indent(gen);
		emit_type(gen, node->data.var_decl.type, subst);
		emit(gen, " ");
		emit(gen, node->data.var_decl.name);
		if (node->data.var_decl.init)
		{
			emit(gen, " = ");
			emit_expression(gen, node->data.var_decl.init, subst);
		}
		emit(gen, ";\n");
		break;

	case AST_PASSTHROUGH:
		emit_indent(gen);
		emit(gen, node->data.passthrough.code);
		emit(gen, ";\n");
		break;

	case AST_EXPR_STMT:
	default:
		// Expression statement
		emit_indent(gen);
		emit_expression(gen, node, subst);
		emit(gen, ";\n");
		break;
	}
}

// Emit a specialized struct
static void emit_struct_instantiation(CodeGen *gen, ASTNode *struct_def, Instantiation *inst)
{
	TypeSubst *subst = build_subst(struct_def->data.struct_def.type_params, inst->type_args);

	emit(gen, "struct ");
	emit(gen, inst->mangled_name);
	emit(gen, " {\n");
	gen->indent++;

	ASTNode *member = struct_def->data.struct_def.members;
	while (member)
	{
		emit_indent(gen);
		emit_type(gen, member->data.var_decl.type, subst);
		emit(gen, " ");
		emit(gen, member->data.var_decl.name);
		emit(gen, ";\n");
		member = member->next;
	}

	gen->indent--;
	emit(gen, "};\n\n");

	free_subst(subst);
}

// Emit a specialized function
static void emit_func_instantiation(CodeGen *gen, ASTNode *func_def, Instantiation *inst)
{
	TypeSubst *subst = build_subst(func_def->data.func_def.type_params, inst->type_args);

	emit_type(gen, func_def->data.func_def.return_type, subst);
	emit(gen, " ");
	emit(gen, inst->mangled_name);
	emit(gen, "(");

	ASTNode *param = func_def->data.func_def.params;
	while (param)
	{
		emit_type(gen, param->data.param.type, subst);
		emit(gen, " ");
		emit(gen, param->data.param.name);
		if (param->next)
			emit(gen, ", ");
		param = param->next;
	}

	emit(gen, ") ");
	emit_statement(gen, func_def->data.func_def.body, subst);
	emit_newline(gen);

	free_subst(subst);
}

// First pass: collect all instantiations needed
static void collect_instantiations(CodeGen *gen, ASTNode *node)
{
	if (!node)
		return;

	switch (node->type)
	{
	case AST_PROGRAM:
	case AST_BLOCK:
	{
		ASTNode *child = node->data.block.statements;
		while (child)
		{
			collect_instantiations(gen, child);
			child = child->next;
		}
	}
	break;

	case AST_FUNC_DEF:
		collect_instantiations(gen, node->data.func_def.body);
		break;

	case AST_VAR_DECL:
		// Check if type uses a generic
		if (node->data.var_decl.type && node->data.var_decl.type->type_args)
		{
			TypeRef *type = node->data.var_decl.type;
			ASTNode *struct_def = find_struct_def(gen->program, type->name);
			if (struct_def && struct_def->data.struct_def.type_params)
			{
				add_instantiation(&gen->struct_instantiations, type->name, type->type_args);
			}
		}
		collect_instantiations(gen, node->data.var_decl.init);
		break;

	case AST_CALL:
		if (node->data.call.type_args && node->data.call.callee->type == AST_IDENTIFIER)
		{
			char *name = node->data.call.callee->data.ident.name;
			ASTNode *func_def = find_func_def(gen->program, name);
			if (func_def && func_def->data.func_def.type_params)
			{
				add_instantiation(&gen->func_instantiations, name, node->data.call.type_args);
			}
		}
		collect_instantiations(gen, node->data.call.callee);
		{
			ASTNode *arg = node->data.call.args;
			while (arg)
			{
				collect_instantiations(gen, arg);
				arg = arg->next;
			}
		}
		break;

	case AST_BINARY:
		collect_instantiations(gen, node->data.binary.left);
		collect_instantiations(gen, node->data.binary.right);
		break;

	case AST_UNARY:
		collect_instantiations(gen, node->data.unary.operand);
		break;

	case AST_RETURN:
		collect_instantiations(gen, node->data.ret.value);
		break;

	case AST_IF:
		collect_instantiations(gen, node->data.if_stmt.condition);
		collect_instantiations(gen, node->data.if_stmt.then_branch);
		collect_instantiations(gen, node->data.if_stmt.else_branch);
		break;

	case AST_WHILE:
		collect_instantiations(gen, node->data.while_stmt.condition);
		collect_instantiations(gen, node->data.while_stmt.body);
		break;

	case AST_FOR:
		collect_instantiations(gen, node->data.for_stmt.init);
		collect_instantiations(gen, node->data.for_stmt.condition);
		collect_instantiations(gen, node->data.for_stmt.update);
		collect_instantiations(gen, node->data.for_stmt.body);
		break;

	default:
		break;
	}
}

void codegen_generate(CodeGen *gen)
{
	emit(gen, "/* Generated by SafeC compiler */\n\n");

	// First pass: collect all needed instantiations
	collect_instantiations(gen, gen->program);

	// Emit all struct instantiations
	Instantiation *inst = gen->struct_instantiations;
	while (inst)
	{
		ASTNode *struct_def = find_struct_def(gen->program, inst->generic_name);
		if (struct_def)
		{
			emit_struct_instantiation(gen, struct_def, inst);
		}
		inst = inst->next;
	}

	// Emit all function instantiations
	inst = gen->func_instantiations;
	while (inst)
	{
		ASTNode *func_def = find_func_def(gen->program, inst->generic_name);
		if (func_def)
		{
			emit_func_instantiation(gen, func_def, inst);
		}
		inst = inst->next;
	}

	// Emit non-generic declarations
	ASTNode *decl = gen->program->data.block.statements;
	while (decl)
	{
		switch (decl->type)
		{
		case AST_STRUCT_DEF:
			// Skip generics (already instantiated)
			if (!decl->data.struct_def.type_params)
			{
				emit(gen, "struct ");
				emit(gen, decl->data.struct_def.name);
				emit(gen, " {\n");
				gen->indent++;

				ASTNode *member = decl->data.struct_def.members;
				while (member)
				{
					emit_indent(gen);
					emit_type(gen, member->data.var_decl.type, NULL);
					emit(gen, " ");
					emit(gen, member->data.var_decl.name);
					emit(gen, ";\n");
					member = member->next;
				}

				gen->indent--;
				emit(gen, "};\n\n");
			}
			break;

		case AST_FUNC_DEF:
			// Skip generics (already instantiated)
			if (!decl->data.func_def.type_params)
			{
				emit_type(gen, decl->data.func_def.return_type, NULL);
				emit(gen, " ");
				emit(gen, decl->data.func_def.name);
				emit(gen, "(");

				ASTNode *param = decl->data.func_def.params;
				while (param)
				{
					emit_type(gen, param->data.param.type, NULL);
					emit(gen, " ");
					emit(gen, param->data.param.name);
					if (param->next)
						emit(gen, ", ");
					param = param->next;
				}

				emit(gen, ") ");
				emit_statement(gen, decl->data.func_def.body, NULL);
				emit_newline(gen);
			}
			break;

		case AST_FUNC_DECL:
			emit_type(gen, decl->data.func_def.return_type, NULL);
			emit(gen, " ");
			emit(gen, decl->data.func_def.name);
			emit(gen, "(");

			ASTNode *param = decl->data.func_def.params;
			while (param)
			{
				emit_type(gen, param->data.param.type, NULL);
				emit(gen, " ");
				emit(gen, param->data.param.name);
				if (param->next)
					emit(gen, ", ");
				param = param->next;
			}

			emit(gen, ");\n");
			break;

		case AST_VAR_DECL:
			emit_type(gen, decl->data.var_decl.type, NULL);
			emit(gen, " ");
			emit(gen, decl->data.var_decl.name);
			if (decl->data.var_decl.init)
			{
				emit(gen, " = ");
				emit_expression(gen, decl->data.var_decl.init, NULL);
			}
			emit(gen, ";\n");
			break;

		case AST_TYPEDEF:
			emit(gen, "typedef ");
			emit_type(gen, decl->data.typedef_stmt.type, NULL);
			emit(gen, " ");
			emit(gen, decl->data.typedef_stmt.name);
			emit(gen, ";\n");
			break;

		default:
			break;
		}

		decl = decl->next;
	}
}
