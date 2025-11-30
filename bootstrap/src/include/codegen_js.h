#pragma once
#include <string>
#include <memory>
#include "ast.h"

class CodeGeneratorJS
{
public:
	std::string generate(std::shared_ptr<ASTNode> ast);

private:
	std::string generateNode(std::shared_ptr<ASTNode> node);
	std::string generateFunctionBlock(std::shared_ptr<ASTNode> block, const std::string &returnType);
};
