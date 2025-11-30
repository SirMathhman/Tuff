#include "type_checker.h"
#include <iostream>

void TypeChecker::check(std::shared_ptr<ASTNode> node)
{
	switch (node->type)
	{
	case ASTNodeType::PROGRAM:
		for (auto child : node->children)
		{
			check(child);
		}
		break;

	case ASTNodeType::LET_STMT:
	{
		std::string name = node->value;
		if (symbolTable.find(name) != symbolTable.end())
		{
			std::cerr << "Error: Variable '" << name << "' already declared (no shadowing allowed)." << std::endl;
			exit(1);
		}

		auto init = node->children[0];
		check(init);

		std::string type = node->inferredType;
		if (type == "Inferred")
		{
			type = init->inferredType;
			node->inferredType = type; // Update AST with inferred type
		}
		else
		{
			if (type != init->inferredType)
			{
				std::cerr << "Error: Type mismatch for '" << name << "'. Expected " << type << ", got " << init->inferredType << std::endl;
				exit(1);
			}
		}

		symbolTable[name] = {type, node->isMutable};
		break;
	}

	case ASTNodeType::ASSIGNMENT_STMT:
	{
		std::string name = node->value;
		auto it = symbolTable.find(name);
		if (it == symbolTable.end())
		{
			std::cerr << "Error: Variable '" << name << "' not declared." << std::endl;
			exit(1);
		}

		if (!it->second.isMutable)
		{
			std::cerr << "Error: Cannot assign to immutable variable '" << name << "'." << std::endl;
			exit(1);
		}

		auto value = node->children[0];
		check(value);

		if (it->second.type != value->inferredType)
		{
			std::cerr << "Error: Type mismatch in assignment to '" << name << "'. Expected " << it->second.type << ", got " << value->inferredType << std::endl;
			exit(1);
		}
		break;
	}

	case ASTNodeType::IDENTIFIER:
	{
		std::string name = node->value;
		auto it = symbolTable.find(name);
		if (it == symbolTable.end())
		{
			std::cerr << "Error: Variable '" << name << "' not declared." << std::endl;
			exit(1);
		}
		node->inferredType = it->second.type;
		break;
	}

	case ASTNodeType::LITERAL:
		// Type already set by parser (e.g., I32)
		break;

	case ASTNodeType::BINARY_OP:
	{
		auto left = node->children[0];
		auto right = node->children[1];
		check(left);
		check(right);

		std::string op = node->value;
		// Arithmetic ops: both operands must be numeric, result is same type
		if (op == "+" || op == "-" || op == "*" || op == "/" || op == "%")
		{
			if (!isNumericType(left->inferredType))
			{
				std::cerr << "Error: Left operand of '" << op << "' must be numeric, got " << left->inferredType << std::endl;
				exit(1);
			}
			if (!isNumericType(right->inferredType))
			{
				std::cerr << "Error: Right operand of '" << op << "' must be numeric, got " << right->inferredType << std::endl;
				exit(1);
			}
			if (left->inferredType != right->inferredType)
			{
				std::cerr << "Error: Type mismatch in '" << op << "': " << left->inferredType << " and " << right->inferredType << std::endl;
				exit(1);
			}
			node->inferredType = left->inferredType;
		}
		// Comparison ops: both must be same numeric type, result is Bool
		else if (op == "<" || op == ">" || op == "<=" || op == ">=" || op == "==" || op == "!=")
		{
			if (left->inferredType != right->inferredType)
			{
				std::cerr << "Error: Type mismatch in '" << op << "': " << left->inferredType << " and " << right->inferredType << std::endl;
				exit(1);
			}
			if (!isNumericType(left->inferredType))
			{
				std::cerr << "Error: Cannot compare non-numeric types with '" << op << "'" << std::endl;
				exit(1);
			}
			node->inferredType = "Bool";
		}
		// Logical ops: both must be Bool, result is Bool
		else if (op == "&&" || op == "||")
		{
			if (left->inferredType != "Bool")
			{
				std::cerr << "Error: Left operand of '" << op << "' must be Bool, got " << left->inferredType << std::endl;
				exit(1);
			}
			if (right->inferredType != "Bool")
			{
				std::cerr << "Error: Right operand of '" << op << "' must be Bool, got " << right->inferredType << std::endl;
				exit(1);
			}
			node->inferredType = "Bool";
		}
		break;
	}

	case ASTNodeType::UNARY_OP:
	{
		auto operand = node->children[0];
		check(operand);

		std::string op = node->value;
		if (op == "!")
		{
			if (operand->inferredType != "Bool")
			{
				std::cerr << "Error: Operand of '!' must be Bool, got " << operand->inferredType << std::endl;
				exit(1);
			}
			node->inferredType = "Bool";
		}
		else if (op == "-")
		{
			if (!isNumericType(operand->inferredType))
			{
				std::cerr << "Error: Operand of '-' must be numeric, got " << operand->inferredType << std::endl;
				exit(1);
			}
			node->inferredType = operand->inferredType;
		}
		break;
	}

	case ASTNodeType::IF_STMT:
	{
		auto condition = node->children[0];
		check(condition);
		if (condition->inferredType != "Bool")
		{
			std::cerr << "Error: If condition must be Bool, got " << condition->inferredType << std::endl;
			exit(1);
		}

		auto thenBranch = node->children[1];
		check(thenBranch);

		if (node->children.size() > 2)
		{
			auto elseBranch = node->children[2];
			check(elseBranch);
		}
		break;
	}

	case ASTNodeType::IF_EXPR:
	{
		auto condition = node->children[0];
		check(condition);
		if (condition->inferredType != "Bool")
		{
			std::cerr << "Error: If condition must be Bool, got " << condition->inferredType << std::endl;
			exit(1);
		}

		auto thenBranch = node->children[1];
		auto elseBranch = node->children[2];
		check(thenBranch);
		check(elseBranch);

		// For now, just use the then branch type (union types deferred)
		// TODO: Implement proper union type merging (e.g., 100I32 | 200I32)
		if (thenBranch->inferredType == elseBranch->inferredType)
		{
			node->inferredType = thenBranch->inferredType;
		}
		else
		{
			// Simplified: use the then branch type for now
			// In full implementation, this would be a union type
			node->inferredType = thenBranch->inferredType;
		}
		break;
	}

	case ASTNodeType::WHILE_STMT:
	{
		auto condition = node->children[0];
		check(condition);
		if (condition->inferredType != "Bool")
		{
			std::cerr << "Error: While condition must be Bool, got " << condition->inferredType << std::endl;
			exit(1);
		}

		auto body = node->children[1];
		check(body);
		break;
	}

	case ASTNodeType::LOOP_STMT:
	{
		auto body = node->children[0];
		check(body);
		break;
	}

	case ASTNodeType::BREAK_STMT:
	case ASTNodeType::CONTINUE_STMT:
		// No type checking needed
		break;

	case ASTNodeType::BLOCK:
	{
		// Create new scope for block
		auto savedSymbols = symbolTable;
		for (auto child : node->children)
		{
			check(child);
		}
		// Restore scope after block
		symbolTable = savedSymbols;
		break;
	}

	default:
		break;
	}
}
