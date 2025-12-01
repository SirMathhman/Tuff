#include "codegen_cpp.h"
#include <sstream>
#include <vector>

std::string CodeGeneratorCPP::generateLetStmt(std::shared_ptr<ASTNode> node)
{
	std::string cppType = mapType(node->inferredType);

	// Generate value with potential union wrapping
	std::string value = generateNode(node->children[0]);
	std::string wrappedValue = wrapInUnion(value, node->children[0]->inferredType, node->inferredType);

	// Track variable with destructor if applicable
	std::string dtor = getDestructor(node->inferredType);
	if (!dtor.empty() && !scopes.empty())
	{
		scopes.back().vars.push_back({node->value, dtor});
	}

	std::string safeName = escapeCppKeyword(node->value);

	// Handle C++ array declaration: int32_t arr[3] instead of int32_t[3] arr
	size_t bracketPos = cppType.find('[');
	if (bracketPos != std::string::npos)
	{
		std::string baseType = cppType.substr(0, bracketPos);
		std::string arraySuffix = cppType.substr(bracketPos);
		std::string prefix = node->isMutable ? "" : "const ";
		return prefix + baseType + " " + safeName + arraySuffix + " = " + wrappedValue;
	}

	// For pointer types, const goes after * (e.g., int32_t* const p)
	if (!cppType.empty() && cppType.back() == '*')
	{
		if (node->isMutable)
		{
			return cppType + " " + safeName + " = " + wrappedValue;
		}
		else
		{
			return cppType + " const " + safeName + " = " + wrappedValue;
		}
	}

	std::string prefix = node->isMutable ? "" : "const ";
	return prefix + cppType + " " + safeName + " = " + wrappedValue;
}

std::string CodeGeneratorCPP::generateAssignmentStmt(std::shared_ptr<ASTNode> node)
{
	auto lhs = node->children[0];
	auto rhs = node->children[1];
	return generateNode(lhs) + " = " + generateNode(rhs);
}

std::string CodeGeneratorCPP::generateIfStmt(std::shared_ptr<ASTNode> node)
{
	// Check if it's used as an expression
	if (!node->inferredType.empty() && node->inferredType != "Void")
	{
		// It's an expression, generate ternary
		std::stringstream ss;
		ss << "(" << generateNode(node->children[0]) << " ? ";
		
		auto thenBranch = node->children[1];
		auto elseBranch = node->children[2];
		
		if (thenBranch->type == ASTNodeType::BLOCK)
			ss << generateFunctionBlock(thenBranch, node->inferredType, true); // true for lambda-like body
		else
			ss << generateNode(thenBranch);
			
		ss << " : ";
		
		if (elseBranch->type == ASTNodeType::BLOCK)
			ss << generateFunctionBlock(elseBranch, node->inferredType, true);
		else
			ss << generateNode(elseBranch);
			
		ss << ")";
		return ss.str();
	}
	
	std::stringstream ss;
	ss << "if (" << generateNode(node->children[0]) << ") ";
	
	// If branches are not blocks, wrap them in blocks for safety
	if (node->children[1]->type != ASTNodeType::BLOCK)
		ss << "{\n  " << generateNode(node->children[1]) << ";\n}";
	else
		ss << generateNode(node->children[1]);
		
	if (node->children.size() > 2)
	{
		ss << " else ";
		if (node->children[2]->type != ASTNodeType::BLOCK && node->children[2]->type != ASTNodeType::IF_STMT)
			ss << "{\n  " << generateNode(node->children[2]) << ";\n}";
		else
			ss << generateNode(node->children[2]);
	}
	return ss.str();
}

std::string CodeGeneratorCPP::generateWhileStmt(std::shared_ptr<ASTNode> node)
{
	std::stringstream ss;
	ss << "while (" << generateNode(node->children[0]) << ") ";
	nextBlockIsLoop = true;
	ss << generateNode(node->children[1]);
	return ss.str();
}

std::string CodeGeneratorCPP::generateLoopStmt(std::shared_ptr<ASTNode> node)
{
	std::stringstream ss;
	ss << "while (true) ";
	nextBlockIsLoop = true;
	ss << generateNode(node->children[0]);
	return ss.str();
}

std::string CodeGeneratorCPP::generateBreakStmt(std::shared_ptr<ASTNode> node)
{
	// Inject destructor calls for all scopes up to nearest loop
	std::stringstream ss;
	for (auto it = scopes.rbegin(); it != scopes.rend(); ++it)
	{
		for (auto vit = it->vars.rbegin(); vit != it->vars.rend(); ++vit)
		{
			ss << vit->destructor << "(" << vit->name << "); ";
		}
		if (it->isLoop)
			break;
	}
	ss << "break";
	return ss.str();
}

std::string CodeGeneratorCPP::generateContinueStmt(std::shared_ptr<ASTNode> node)
{
	// Inject destructor calls for current loop scope only
	std::stringstream ss;
	for (auto it = scopes.rbegin(); it != scopes.rend(); ++it)
	{
		for (auto vit = it->vars.rbegin(); vit != it->vars.rend(); ++vit)
		{
			ss << vit->destructor << "(" << vit->name << "); ";
		}
		if (it->isLoop)
			break;
	}
	ss << "continue";
	return ss.str();
}

std::string CodeGeneratorCPP::generateReturnStmt(std::shared_ptr<ASTNode> node)
{
	std::stringstream ss;
	// Inject destructor calls for all scopes before return
	for (auto it = scopes.rbegin(); it != scopes.rend(); ++it)
	{
		for (auto vit = it->vars.rbegin(); vit != it->vars.rend(); ++vit)
		{
			ss << vit->destructor << "(" << vit->name << "); ";
		}
	}
	if (node->children.empty())
		ss << "return";
	else
		ss << "return " << generateNode(node->children[0]);
	return ss.str();
}
