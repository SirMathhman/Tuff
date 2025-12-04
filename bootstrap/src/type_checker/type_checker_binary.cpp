#include "type_checker.h"
#include <iostream>

void TypeChecker::checkBinaryOp(std::shared_ptr<ASTNode> node)
{
	auto left = node->children[0];
	auto right = node->children[1];
	check(left);
	check(right);

	std::string leftType = expandTypeAlias(left->inferredType);
	std::string rightType = expandTypeAlias(right->inferredType);

	// Use exprType if available
	if (left->exprType && right->exprType)
	{
		// Handle intersection types - extract the left component for type checking
		// but preserve the full intersection for the result
		// e.g., *mut [T] & #free -> use *mut [T] for checking, preserve & #free
		auto leftExpr = left->exprType;
		ExprPtr destructorExpr = nullptr;  // Will hold #free if present
		
		if (leftExpr->kind == ExprKind::BINARY)
		{
			auto bin = leftExpr->as<BinaryExpr>();
			if (bin->op == BinaryOp::INTERSECTION)
			{
				destructorExpr = bin->right;  // Save the destructor part
				leftExpr = bin->left;         // Use the pointer part for checking
			}
		}

		if (node->value == "+" || node->value == "-" || node->value == "*" || node->value == "/" || node->value == "%")
		{
			// Pointer arithmetic: ptr + int
			if (leftExpr->kind == ExprKind::UNARY && leftExpr->as<UnaryExpr>()->op == UnaryOp::STAR && isNumericType(right->exprType))
			{
				auto ptr = leftExpr->as<UnaryExpr>();
				ExprPtr resultType = nullptr;
				bool isArrayDecay = false;
				
				// Check for *mut [T] -> Unary(STAR, Unary(MUT, Array(T)))
				if (ptr->operand->kind == ExprKind::UNARY && ptr->operand->as<UnaryExpr>()->op == UnaryOp::MUT)
				{
					auto mut = ptr->operand->as<UnaryExpr>();
					if (mut->operand->kind == ExprKind::ARRAY)
					{
						auto arr = mut->operand->as<ArrayExpr>();
						resultType = makePtrMut(arr->elementType);
						isArrayDecay = true;  // Array decayed to element pointer
					}
				}
				// Check for *[T] -> Unary(STAR, Array(T))
				else if (ptr->operand->kind == ExprKind::ARRAY)
				{
					auto arr = ptr->operand->as<ArrayExpr>();
					resultType = makePtr(arr->elementType);
					isArrayDecay = true;  // Array decayed to element pointer
				}
				else
				{
					// Non-array pointer, keep the original type
					resultType = leftExpr;
				}
				
				// Preserve destructor annotation ONLY for non-array decay
				// When array decays to element pointer, the destructor should NOT be preserved
				// because the destructor is for the whole array, not individual elements
				if (destructorExpr && resultType && !isArrayDecay)
				{
					node->exprType = makeBinary(BinaryOp::INTERSECTION, resultType, destructorExpr);
				}
				else
				{
					node->exprType = resultType;
				}
				node->inferredType = exprTypeToString(node->exprType);
				return;
			}

			if (!isNumericType(leftExpr) || !isNumericType(right->exprType))
			{
				std::cerr << "Error: Operands of '" << node->value << "' must be numeric." << std::endl;
				std::cerr << "  Left operand: " << exprTypeToString(left->exprType) << std::endl;
				std::cerr << "  Right operand: " << exprTypeToString(right->exprType) << std::endl;
				exit(1);
			}

			if (areTypesEqual(leftExpr, makePrimitive(PrimitiveKind::USize)) ||
					areTypesEqual(right->exprType, makePrimitive(PrimitiveKind::USize)) ||
					leftExpr->kind == ExprKind::SIZEOF || right->exprType->kind == ExprKind::SIZEOF)
			{
				node->exprType = makePrimitive(PrimitiveKind::USize);
			}
			else
			{
				// Preserve type if both are same float/int
				if (areTypesEqual(leftExpr, right->exprType))
				{
					node->exprType = leftExpr;
				}
				else
				{
					node->exprType = makePrimitive(PrimitiveKind::I32);
				}
			}
			node->inferredType = exprTypeToString(node->exprType);
			return;
		}
		else if (node->value == "&")
		{
			if (!isNumericType(leftExpr) || !isNumericType(right->exprType))
			{
				std::cerr << "Error: Operands of '&' must be numeric." << std::endl;
				std::cerr << "  Left operand: " << exprTypeToString(left->exprType) << std::endl;
				std::cerr << "  Right operand: " << exprTypeToString(right->exprType) << std::endl;
				exit(1);
			}
			node->exprType = leftExpr;
			node->inferredType = exprTypeToString(node->exprType);
			return;
		}
		else if (node->value == "==" || node->value == "!=")
		{
			node->exprType = makePrimitive(PrimitiveKind::Bool);
			node->inferredType = "Bool";
			return;
		}
		else if (node->value == "<" || node->value == ">" || node->value == "<=" || node->value == ">=")
		{
			if (!isNumericType(leftExpr) || !isNumericType(right->exprType))
			{
				std::cerr << "Error: Operands of '" << node->value << "' must be numeric." << std::endl;
				std::cerr << "  Left operand: " << exprTypeToString(left->exprType) << std::endl;
				std::cerr << "  Right operand: " << exprTypeToString(right->exprType) << std::endl;
				exit(1);
			}
			node->exprType = makePrimitive(PrimitiveKind::Bool);
			node->inferredType = "Bool";
			return;
		}
		else if (node->value == "&&" || node->value == "||")
		{
			if (!isBoolType(leftExpr) || !isBoolType(right->exprType))
			{
				std::cerr << "Error: Operands of '" << node->value << "' must be Bool." << std::endl;
				exit(1);
			}
			node->exprType = makePrimitive(PrimitiveKind::Bool);
			node->inferredType = "Bool";
			return;
		}
	}

	// Fallback: String-based type checking (legacy path)
	// Handle intersection types (take first component for type checking)
	std::string leftDestructor = "";
	size_t ampPos = leftType.find('&');
	if (ampPos != std::string::npos)
	{
		int depth = 0;
		size_t splitPos = std::string::npos;
		for (size_t i = 0; i < leftType.length(); i++)
		{
			if (leftType[i] == '<')
				depth++;
			else if (leftType[i] == '>')
				depth--;
			else if (leftType[i] == '&' && depth == 0)
			{
				splitPos = i;
				break;
			}
		}
		if (splitPos != std::string::npos)
		{
			leftDestructor = leftType.substr(splitPos);
			leftType = leftType.substr(0, splitPos);
			while (!leftType.empty() && leftType.back() == ' ')
				leftType.pop_back();
		}
	}

	if (node->value == "+" || node->value == "-" || node->value == "*" || node->value == "/" || node->value == "%")
	{
		// Allow pointer arithmetic: ptr + int
		if (leftType.length() > 0 && leftType[0] == '*' && isNumericType(rightType))
		{
			size_t bracketPos = leftType.find('[');
			if (bracketPos != std::string::npos)
			{
				// Array decay: *[T] or *mut [T] -> *T or *mut T
				// Do NOT preserve destructor - it applies to the array, not elements
				bool isMutable = (leftType.substr(1, 4) == "mut ");
				size_t startPos = isMutable ? 6 : 2;
				size_t semiPos = leftType.find(';');
				std::string elementType;
				if (semiPos == std::string::npos)
					elementType = leftType.substr(startPos, leftType.length() - startPos - 1);
				else
					elementType = leftType.substr(startPos, semiPos - startPos);

				if (isMutable)
					node->inferredType = "*mut " + elementType;
				else
					node->inferredType = "*" + elementType;
			}
			else
			{
				// Non-array pointer: preserve destructor
				node->inferredType = leftType + leftDestructor;
			}
			return;
		}

		if (!isNumericType(leftType) || !isNumericType(rightType))
		{
			std::cerr << "Error: Operands of '" << node->value << "' must be numeric." << std::endl;
			std::cerr << "  Left operand: " << leftType << std::endl;
			std::cerr << "  Right operand: " << rightType << std::endl;
			exit(1);
		}

		if (leftType == "USize" || rightType == "USize" ||
				leftType.rfind("SizeOf<", 0) == 0 || rightType.rfind("SizeOf<", 0) == 0)
		{
			node->inferredType = "USize";
		}
		else
		{
			node->inferredType = "I32";
		}
	}
	else if (node->value == "&")
	{
		if (!isNumericType(leftType) || !isNumericType(rightType))
		{
			std::cerr << "Error: Operands of '&' must be numeric." << std::endl;
			std::cerr << "  Left operand: " << leftType << std::endl;
			std::cerr << "  Right operand: " << rightType << std::endl;
			exit(1);
		}
		node->inferredType = leftType;
	}
	else if (node->value == "==" || node->value == "!=")
	{
		node->inferredType = "Bool";
	}
	else if (node->value == "<" || node->value == ">" || node->value == "<=" || node->value == ">=")
	{
		if (!isNumericType(leftType) || !isNumericType(rightType))
		{
			std::cerr << "Error: Operands of '" << node->value << "' must be numeric." << std::endl;
			std::cerr << "  Left operand: " << leftType << std::endl;
			std::cerr << "  Right operand: " << rightType << std::endl;
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
