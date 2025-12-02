#pragma once

#include "ast.h"
#include "ast_typed.h"
#include <iostream>

// ============================================================================
// AST CONVERTER - Converts old ASTNode to new typed AST
// ============================================================================

class ASTConverter
{
public:
	static ast::ExprPtr toExpr(std::shared_ptr<ASTNode> node)
	{
		if (!node)
			return nullptr;

		switch (node->type)
		{
		case ASTNodeType::LITERAL:
		{
			ast::Literal expr;
			expr.value = node->value;
			expr.inferredType = node->inferredType;
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::IDENTIFIER:
		{
			ast::Identifier expr;
			expr.name = node->value;
			expr.genericArgs = node->genericArgs;
			expr.inferredType = node->inferredType;
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::BINARY_OP:
		{
			ast::BinaryOp expr;
			expr.op = node->value;
			expr.left = toExpr(node->children[0]);
			expr.right = toExpr(node->children[1]);
			expr.inferredType = node->inferredType;
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::UNARY_OP:
		{
			ast::UnaryOp expr;
			expr.op = node->value;
			expr.operand = toExpr(node->children[0]);
			expr.inferredType = node->inferredType;
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::REFERENCE_EXPR:
		{
			ast::Reference expr;
			expr.operand = toExpr(node->children[0]);
			expr.isMutable = node->isMutable;
			expr.inferredType = node->inferredType;
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::DEREF_EXPR:
		{
			ast::Deref expr;
			expr.operand = toExpr(node->children[0]);
			expr.inferredType = node->inferredType;
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::FIELD_ACCESS:
		{
			ast::FieldAccess expr;
			expr.object = toExpr(node->children[0]);
			expr.fieldName = node->value;
			expr.objectInferredType = node->children[0]->inferredType;
			expr.isNarrowedUnion = node->children[0]->isNarrowedUnion;
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::INDEX_EXPR:
		{
			ast::Index expr;
			expr.object = toExpr(node->children[0]);
			expr.index = toExpr(node->children[1]);
			expr.inferredType = node->inferredType;
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::CALL_EXPR:
		{
			ast::Call expr;
			expr.callee = toExpr(node->children[0]);
			for (size_t i = 1; i < node->children.size(); i++)
			{
				expr.args.push_back(toExpr(node->children[i]));
			}
			expr.calleeIsExtern = node->calleeIsExtern;
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::STRUCT_LITERAL:
		{
			ast::StructLiteral expr;
			expr.typeName = node->value;
			expr.genericArgs = node->genericArgs;
			expr.fieldNames = node->fieldNames;
			for (auto &child : node->children)
			{
				expr.fields.push_back(toExpr(child));
			}
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::ARRAY_LITERAL:
		{
			ast::ArrayLiteral expr;
			for (auto &child : node->children)
			{
				expr.elements.push_back(toExpr(child));
			}
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::IF_EXPR:
		{
			ast::If expr;
			expr.condition = toExpr(node->children[0]);
			expr.thenBranch = toExpr(node->children[1]);
			expr.elseBranch = toExpr(node->children[2]);
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::MATCH_EXPR:
		{
			ast::Match expr;
			expr.scrutinee = toExpr(node->children[0]);
			for (size_t i = 1; i < node->children.size(); i++)
			{
				ast::MatchArm arm;
				arm.pattern = node->children[i]->value;
				arm.body = toExpr(node->children[i]->children[0]);
				expr.arms.push_back(arm);
			}
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::IS_EXPR:
		{
			ast::Is expr;
			expr.value = toExpr(node->children[0]);
			expr.targetTypeStr = node->value;
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::SIZEOF_EXPR:
		{
			ast::SizeOf expr;
			expr.typeStr = node->value;
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::BLOCK:
		{
			ast::Block expr;
			for (auto &child : node->children)
			{
				expr.statements.push_back(toStmt(child));
			}
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		case ASTNodeType::ENUM_VALUE:
		{
			ast::EnumValue expr;
			expr.enumName = node->children[0]->value;
			expr.variant = node->value;
			expr.exprType = node->exprType;
			return std::make_shared<ast::Expr>(expr);
		}

		default:
			std::cerr << "ASTConverter: Unknown expr type " << (int)node->type << std::endl;
			return nullptr;
		}
	}

	static ast::StmtPtr toStmt(std::shared_ptr<ASTNode> node)
	{
		if (!node)
			return nullptr;

		switch (node->type)
		{
		case ASTNodeType::LET_STMT:
		{
			ast::Let stmt;
			stmt.name = node->value;
			stmt.isMutable = node->isMutable;
			if (node->children.size() > 0)
			{
				stmt.initializer = toExpr(node->children[0]);
			}
			return std::make_shared<ast::Stmt>(stmt);
		}

		case ASTNodeType::ASSIGNMENT_STMT:
		{
			ast::Assignment stmt;
			stmt.target = toExpr(node->children[0]);
			stmt.value = toExpr(node->children[1]);
			return std::make_shared<ast::Stmt>(stmt);
		}

		case ASTNodeType::IF_STMT:
		{
			ast::IfStmt stmt;
			stmt.condition = toExpr(node->children[0]);
			stmt.thenBranch = toExpr(node->children[1]);
			if (node->children.size() > 2)
			{
				stmt.elseBranch = toExpr(node->children[2]);
			}
			return std::make_shared<ast::Stmt>(stmt);
		}

		case ASTNodeType::WHILE_STMT:
		{
			ast::While stmt;
			stmt.condition = toExpr(node->children[0]);
			stmt.body = toExpr(node->children[1]);
			return std::make_shared<ast::Stmt>(stmt);
		}

		case ASTNodeType::LOOP_STMT:
		{
			ast::Loop stmt;
			stmt.body = toExpr(node->children[0]);
			return std::make_shared<ast::Stmt>(stmt);
		}

		case ASTNodeType::BREAK_STMT:
		{
			return std::make_shared<ast::Stmt>(ast::Break{});
		}

		case ASTNodeType::CONTINUE_STMT:
		{
			return std::make_shared<ast::Stmt>(ast::Continue{});
		}

		case ASTNodeType::RETURN_STMT:
		{
			ast::Return stmt;
			if (node->children.size() > 0)
			{
				stmt.value = toExpr(node->children[0]);
			}
			return std::make_shared<ast::Stmt>(stmt);
		}

		default:
		{
			ast::ExprStmt stmt;
			stmt.expr = toExpr(node);
			return std::make_shared<ast::Stmt>(stmt);
		}
		}
	}
};
