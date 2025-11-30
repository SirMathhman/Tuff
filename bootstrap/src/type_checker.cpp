#include "type_checker.h"
#include <iostream>

void TypeChecker::check(std::shared_ptr<ASTNode> node)
{
	switch (node->type)
	{
	case ASTNodeType::PROGRAM:
		// First pass: register all functions and structs
		for (auto child : node->children)
		{
			if (child->type == ASTNodeType::FUNCTION_DECL)
			{
				std::string funcName = child->value;
				if (functionTable.find(funcName) != functionTable.end())
				{
					std::cerr << "Error: Function '" << funcName << "' already declared." << std::endl;
					exit(1);
				}

				FunctionInfo info;
				info.returnType = child->inferredType; // Return type stored in inferredType

				// Parameters are the first N children, body is the last child
				for (size_t i = 0; i < child->children.size() - 1; i++)
				{
					auto paramNode = child->children[i];
					std::string paramName = paramNode->value;
					std::string paramType = paramNode->inferredType;
					info.params.push_back({paramName, paramType});
				}

				functionTable[funcName] = info;
			}
			else if (child->type == ASTNodeType::STRUCT_DECL)
			{
				std::string structName = child->value;
				if (structTable.find(structName) != structTable.end())
				{
					std::cerr << "Error: Struct '" << structName << "' already declared." << std::endl;
					exit(1);
				}

				StructInfo info;
				for (auto fieldNode : child->children)
				{
					std::string fieldName = fieldNode->value;
					std::string fieldType = fieldNode->inferredType;
					info.fields.push_back({fieldName, fieldType});
				}
				structTable[structName] = info;
			}
		}

		// Second pass: type check all nodes
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
		// Check if it's a field assignment or simple variable assignment
		auto lhs = node->children[0];
		auto value = node->children[1];

		check(lhs); // This will set the inferred type of lhs
		check(value);

		// For field access, lhs already has its type checked
		// For simple identifier, check mutability
		if (lhs->type == ASTNodeType::IDENTIFIER)
		{
			std::string name = lhs->value;
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
		}

		if (lhs->inferredType != value->inferredType)
		{
			std::cerr << "Error: Type mismatch in assignment. Expected " << lhs->inferredType << ", got " << value->inferredType << std::endl;
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

	case ASTNodeType::STRUCT_DECL:
	{
		// Already registered in first pass, just skip
		break;
	}

	case ASTNodeType::FUNCTION_DECL:
	{
		std::string funcName = node->value;
		currentFunctionReturnType = node->inferredType; // Set for return statement validation

		// Create new scope for function parameters
		std::map<std::string, SymbolInfo> savedSymbolTable = symbolTable;
		symbolTable.clear();

		// Add parameters to symbol table (immutable)
		for (size_t i = 0; i < node->children.size() - 1; i++)
		{
			auto paramNode = node->children[i];
			std::string paramName = paramNode->value;
			std::string paramType = paramNode->inferredType;
			symbolTable[paramName] = {paramType, false}; // parameters are immutable
		}

		// Type check function body (last child)
		auto body = node->children.back();
		check(body);

		// Restore symbol table
		symbolTable = savedSymbolTable;
		currentFunctionReturnType = ""; // Clear for safety
		break;
	}

	case ASTNodeType::CALL_EXPR:
	{
		// First child is the callee (should be IDENTIFIER)
		auto callee = node->children[0];
		if (callee->type != ASTNodeType::IDENTIFIER)
		{
			std::cerr << "Error: Expected function name in call expression." << std::endl;
			exit(1);
		}

		std::string funcName = callee->value;
		auto it = functionTable.find(funcName);
		if (it == functionTable.end())
		{
			std::cerr << "Error: Function '" << funcName << "' not declared." << std::endl;
			exit(1);
		}

		const FunctionInfo &info = it->second;

		// Check argument count (children[0] is callee, rest are args)
		size_t argCount = node->children.size() - 1;
		if (argCount != info.params.size())
		{
			std::cerr << "Error: Function '" << funcName << "' expects " << info.params.size()
								<< " arguments, got " << argCount << std::endl;
			exit(1);
		}

		// Check argument types
		for (size_t i = 0; i < argCount; i++)
		{
			auto arg = node->children[i + 1];
			check(arg);
			if (arg->inferredType != info.params[i].second)
			{
				std::cerr << "Error: Argument " << (i + 1) << " to function '" << funcName
									<< "' has type " << arg->inferredType << ", expected " << info.params[i].second << std::endl;
				exit(1);
			}
		}

		node->inferredType = info.returnType;
		break;
	}

	case ASTNodeType::RETURN_STMT:
	{
		if (currentFunctionReturnType.empty())
		{
			std::cerr << "Error: Return statement outside of function." << std::endl;
			exit(1);
		}

		if (node->children.empty())
		{
			// return; with no value
			if (currentFunctionReturnType != "Void")
			{
				std::cerr << "Error: Function expects return type " << currentFunctionReturnType
									<< ", but got void return." << std::endl;
				exit(1);
			}
		}
		else
		{
			// return expr;
			auto expr = node->children[0];
			check(expr);
			if (expr->inferredType != currentFunctionReturnType)
			{
				std::cerr << "Error: Function expects return type " << currentFunctionReturnType
									<< ", but got " << expr->inferredType << std::endl;
				exit(1);
			}
		}
		break;
	}

	case ASTNodeType::STRUCT_LITERAL:
	{
		std::string structName = node->value;

		// Check if struct type exists
		auto it = structTable.find(structName);
		if (it == structTable.end())
		{
			std::cerr << "Error: Unknown struct type '" << structName << "'." << std::endl;
			exit(1);
		}

		const StructInfo &info = it->second;

		// Check field count
		if (node->children.size() != info.fields.size())
		{
			std::cerr << "Error: Struct '" << structName << "' expects " << info.fields.size()
								<< " fields, got " << node->children.size() << std::endl;
			exit(1);
		}

		// Check field types in order
		for (size_t i = 0; i < node->children.size(); i++)
		{
			auto fieldExpr = node->children[i];
			check(fieldExpr);

			const std::string &expectedType = info.fields[i].second;
			if (fieldExpr->inferredType != expectedType)
			{
				std::cerr << "Error: Field " << (i + 1) << " of struct '" << structName
									<< "' expects type " << expectedType << ", got " << fieldExpr->inferredType << std::endl;
				exit(1);
			}
		}

		node->inferredType = structName;
		break;
	}

	case ASTNodeType::FIELD_ACCESS:
	{
		auto object = node->children[0];
		check(object);

		std::string objType = object->inferredType;
		std::string fieldName = node->value;

		// Check if object type is a struct
		auto it = structTable.find(objType);
		if (it == structTable.end())
		{
			std::cerr << "Error: Cannot access field '" << fieldName << "' on non-struct type '" << objType << "'." << std::endl;
			exit(1);
		}

		const StructInfo &info = it->second;

		// Find field
		bool found = false;
		for (const auto &field : info.fields)
		{
			if (field.first == fieldName)
			{
				node->inferredType = field.second;
				found = true;
				break;
			}
		}

		if (!found)
		{
			std::cerr << "Error: Struct '" << objType << "' has no field named '" << fieldName << "'." << std::endl;
			exit(1);
		}
		break;
	}

	default:
		break;
	}
}
