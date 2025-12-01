#include "type_checker.h"
#include <iostream>

void TypeChecker::checkBinaryOp(std::shared_ptr<ASTNode> node)
{
	auto left = node->children[0];
	auto right = node->children[1];
	check(left);
	check(right);

	std::string leftType = left->inferredType;
	std::string rightType = right->inferredType;

	if (node->value == "+" || node->value == "-" || node->value == "*" || node->value == "/" || node->value == "%")
	{
		// Allow pointer arithmetic: ptr + int
		// If ptr is *[T] or *mut [T], result is *T or *mut T (decay to element pointer)
		if (leftType.length() > 0 && leftType[0] == '*' && isNumericType(rightType))
		{
			// Check if it's an array pointer
			size_t bracketPos = leftType.find('[');
			if (bracketPos != std::string::npos)
			{
				// It's *[T] or *mut [T] or *mut [T; ...]
				// Decay to element pointer
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
				node->inferredType = leftType;
			}
			return;
		}

		// Also handle intersection types with pointers (e.g. *mut [T] & #free)
		if (isIntersectionType(leftType))
		{
			auto parts = splitIntersectionType(leftType);
			for (const auto &part : parts)
			{
				if (part.length() > 0 && part[0] == '*' && isNumericType(rightType))
				{
					// Found a pointer part, use logic above
					std::string ptrType = part;
					size_t bracketPos = ptrType.find('[');
					if (bracketPos != std::string::npos)
					{
						bool isMutable = (ptrType.substr(1, 4) == "mut ");
						size_t startPos = isMutable ? 6 : 2;
						size_t semiPos = ptrType.find(';');
						std::string elementType;
						if (semiPos == std::string::npos)
							elementType = ptrType.substr(startPos, ptrType.length() - startPos - 1);
						else
							elementType = ptrType.substr(startPos, semiPos - startPos);

						if (isMutable)
							node->inferredType = "*mut " + elementType;
						else
							node->inferredType = "*" + elementType;
					}
					else
					{
						node->inferredType = ptrType;
					}
					return;
				}
			}
		}

		if (!isNumericType(leftType) || !isNumericType(rightType))
		{
			std::cerr << "Error: Operands of '" << node->value << "' must be numeric." << std::endl;
			exit(1);
		}

		// Handle multiple-of type arithmetic (only for addition)
		if (node->value == "+")
		{
			if (isMultipleOfType(leftType) || isMultipleOfType(rightType))
			{
				node->inferredType = computeMultipleOfAddition(leftType, rightType);
				return;
			}
		}

		// If either operand is USize or SizeOf<T>, result is USize (for sizeOf arithmetic)
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
	else if (node->value == "==" || node->value == "!=")
	{
		node->inferredType = "Bool";
	}
	else if (node->value == "<" || node->value == ">" || node->value == "<=" || node->value == ">=")
	{
		if (!isNumericType(leftType) || !isNumericType(rightType))
		{
			std::cerr << "Error: Operands of '" << node->value << "' must be numeric." << std::endl;
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
