#include "type_checker.h"
#include <iostream>

void TypeChecker::check(std::shared_ptr<ASTNode> node)
{
	switch (node->type)
	{
	case ASTNodeType::PROGRAM:
		registerDeclarations(node);
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

		// Check if it's an enum type name (for EnumName.Variant access)
		// Don't error here, let FIELD_ACCESS handle it
		if (enumTable.find(name) != enumTable.end())
		{
			node->inferredType = name; // Type is the enum name itself
			break;
		}

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
		checkBinaryOp(node);
		break;

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

	case ASTNodeType::ENUM_DECL:
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
		checkCallExpr(node);
		break;

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
		checkFieldOrEnumAccess(node);
		break;

	default:
		break;
	}
}

void TypeChecker::checkBinaryOp(std::shared_ptr<ASTNode> node)
{
	auto left = node->children[0];
	auto right = node->children[1];
	check(left);
	check(right);

	std::string leftType = left->inferredType;
	std::string rightType = right->inferredType;

	if (node->value == "+" || node->value == "-" || node->value == "*" || node->value == "/")
	{
		if ((leftType != "int" && leftType != "float") || (rightType != "int" && rightType != "float"))
		{
			std::cerr << "Error: Operands of '" << node->value << "' must be int or float." << std::endl;
			exit(1);
		}
		node->inferredType = (leftType == "float" || rightType == "float") ? "float" : "int";
	}
	else if (node->value == "==" || node->value == "!=")
	{
		node->inferredType = "Bool";
	}
	else if (node->value == "<" || node->value == ">" || node->value == "<=" || node->value == ">=")
	{
		if ((leftType != "int" && leftType != "float") || (rightType != "int" && rightType != "float"))
		{
			std::cerr << "Error: Operands of '" << node->value << "' must be int or float." << std::endl;
			exit(1);
		}
		node->inferredType = "Bool";
	}
	else if (node->value == "&&" || node->value == "||")
	{
		if (leftType != "Bool" || rightType != "Bool")
		{
			std::cerr << "Error: Operands of '" << node->value << "' must be Bool." << std::endl;
			exit(1);
		}
		node->inferredType = "Bool";
	}
	else
	{
		std::cerr << "Error: Unknown binary operator '" << node->value << "'." << std::endl;
		exit(1);
	}
}

void TypeChecker::checkFieldOrEnumAccess(std::shared_ptr<ASTNode> node)
{
	auto object = node->children[0];
	check(object);

	std::string fieldName = node->value;

	// Check if it's an enum value access (EnumName.Variant)
	if (object->type == ASTNodeType::IDENTIFIER)
	{
		auto enumIt = enumTable.find(object->value);
		if (enumIt != enumTable.end())
		{
			const EnumInfo &enumInfo = enumIt->second;
			bool found = false;
			for (const auto &variant : enumInfo.variants)
			{
				if (variant == fieldName)
				{
					found = true;
					break;
				}
			}
			if (!found)
			{
				std::cerr << "Error: Enum '" << object->value << "' has no variant named '" << fieldName << "'." << std::endl;
				exit(1);
			}
			node->type = ASTNodeType::ENUM_VALUE;
			node->inferredType = object->value;
			return;
		}
	}

	// Otherwise, it's a struct field access
	auto it = structTable.find(object->inferredType);
	if (it == structTable.end())
	{
		std::cerr << "Error: Cannot access field '" << fieldName << "' on non-struct type '" << object->inferredType << "'." << std::endl;
		exit(1);
	}

	const StructInfo &info = it->second;
	for (const auto &field : info.fields)
	{
		if (field.first == fieldName)
		{
			node->inferredType = field.second;
			return;
		}
	}

	std::cerr << "Error: Struct '" << object->inferredType << "' has no field named '" << fieldName << "'." << std::endl;
	exit(1);
}

void TypeChecker::registerDeclarations(std::shared_ptr<ASTNode> node)
{
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
			info.returnType = child->inferredType;
			for (size_t i = 0; i < child->children.size() - 1; i++)
			{
				auto paramNode = child->children[i];
				info.params.push_back({paramNode->value, paramNode->inferredType});
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
				info.fields.push_back({fieldNode->value, fieldNode->inferredType});
			}
			structTable[structName] = info;
		}
		else if (child->type == ASTNodeType::ENUM_DECL)
		{
			std::string enumName = child->value;
			if (enumTable.find(enumName) != enumTable.end())
			{
				std::cerr << "Error: Enum '" << enumName << "' already declared." << std::endl;
				exit(1);
			}

			EnumInfo info;
			for (auto variantNode : child->children)
			{
				info.variants.push_back(variantNode->value);
			}
			enumTable[enumName] = info;
		}
	}
}

void TypeChecker::checkCallExpr(std::shared_ptr<ASTNode> node)
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
}
