#include "codegen_cpp.h"
#include "ast_converter.h"
#include <sstream>
#include <iostream>

std::string CodeGeneratorCPP::generateForwardDeclarations(
		const std::vector<std::shared_ptr<ASTNode>> &functions,
		const std::vector<std::shared_ptr<ASTNode>> &implDecls,
		const std::vector<std::shared_ptr<ASTNode>> &actualDecls)
{
	std::stringstream ss;

	// ========== Generate function forward declarations ==========
	std::vector<std::shared_ptr<ASTNode>> allFunctions = functions;
	for (auto impl : implDecls)
	{
		for (auto child : impl->children)
		{
			if (child->type == ASTNodeType::FUNCTION_DECL)
			{
				allFunctions.push_back(child);
			}
		}
	}

	for (auto child : allFunctions)
	{
		std::string funcName = child->value;
		if (funcName == "main")
			funcName = "tuff_main";

		// Replace :: with _
		size_t pos = 0;
		while ((pos = funcName.find("::", pos)) != std::string::npos)
		{
			funcName.replace(pos, 2, "_");
			pos += 1;
		}

		if (!child->genericParams.empty())
		{
			ss << "template<";
			for (size_t i = 0; i < child->genericParams.size(); i++)
			{
				if (i > 0)
					ss << ", ";
				ss << "typename " << child->genericParams[i]->value;
			}
			ss << ">\n";
		}
		ss << mapType(child->inferredType) << " " << funcName << "(";
		for (size_t i = 0; i < child->children.size() - 1; i++)
		{
			if (i > 0)
				ss << ", ";
			std::string paramType = mapType(child->children[i]->inferredType);
			std::string paramName = child->children[i]->value;
			if (paramName == "this")
				paramName = "this_";
			size_t bracketPos = paramType.find('[');
			if (bracketPos != std::string::npos)
			{
				std::string baseType = paramType.substr(0, bracketPos);
				std::string arraySuffix = paramType.substr(bracketPos);
				ss << baseType << " " << paramName << arraySuffix;
			}
			// Handle function pointer parameters: RetType (*)(Params) -> RetType (*name)(Params)
			else if (paramType.find("(*)") != std::string::npos)
			{
				size_t funcPtrPos = paramType.find("(*)");
				std::string retType = paramType.substr(0, funcPtrPos);
				std::string params = paramType.substr(funcPtrPos + 3);
				while (!retType.empty() && retType.back() == ' ')
					retType.pop_back();
				ss << retType << " (*" << paramName << ")" << params;
			}
			else
			{
				ss << paramType << " " << paramName;
			}
		}
		ss << ");\n";
	}

	// ========== Generate actual function forward declarations ==========
	for (auto child : actualDecls)
	{
		ss << mapType(child->inferredType) << " " << child->value << "(";
		size_t paramCount = 0;
		for (auto param : child->children)
		{
			if (param->type == ASTNodeType::IDENTIFIER)
			{
				if (paramCount > 0)
					ss << ", ";
				std::string paramType = mapType(param->inferredType);
				std::string paramName = param->value;

				// Check if this is a function pointer type
				if (isFunctionPointerType(param->inferredType))
				{
					ss << formatFunctionPointerParam(paramType, paramName);
				}
				else
				{
					size_t bracketPos = paramType.find('[');
					if (bracketPos != std::string::npos)
					{
						std::string baseType = paramType.substr(0, bracketPos);
						std::string arraySuffix = paramType.substr(bracketPos);
						ss << baseType << " " << paramName << arraySuffix;
					}
					else
					{
						ss << paramType << " " << paramName;
					}
				}
				paramCount++;
			}
		}
		ss << ");\n";
	}

	return ss.str();
}

// ============================================================================
// PER-FILE CODE GENERATION
// ============================================================================

FileOutput CodeGeneratorCPP::generateFile(std::shared_ptr<ASTNode> ast, const std::string &moduleName)
{
	FileOutput output;
	output.header = generateFileHeader(ast, moduleName);
	output.implementation = generateFileImplementation(ast, moduleName);
	output.dependencies = extractDependencies(ast);
	return output;
}

bool CodeGeneratorCPP::shouldExport(std::shared_ptr<ASTNode> node)
{
	return node->type == ASTNodeType::EXPECT_DECL ||
				 (node->type == ASTNodeType::FUNCTION_DECL && node->value == "main") ||
				 node->isExported;
}

std::set<std::string> CodeGeneratorCPP::extractDependencies(std::shared_ptr<ASTNode> ast)
{
	std::set<std::string> deps;
	for (const auto &child : ast->children)
		if (child->type == ASTNodeType::USE_DECL)
			deps.insert(child->value);
	return deps;
}

std::string CodeGeneratorCPP::generateFileHeader(std::shared_ptr<ASTNode> ast, const std::string &moduleName)
{
	std::stringstream h;
	h << "#pragma once\n\n#include <cstdint>\n#include <string>\n#include <memory>\n#include <cstddef>\n\n";

	auto deps = extractDependencies(ast);
	if (!deps.empty())
	{
		h << "// Dependencies\n";
		for (const auto &dep : deps)
		{
			std::string hpath = dep;
			size_t pos = 0;
			while ((pos = hpath.find("::")) != std::string::npos)
				hpath.replace(pos, 2, "/");
			h << "#include \"" << hpath << ".h\"\n";
		}
		h << "\n";
	}

	std::vector<std::shared_ptr<ASTNode>> structs, enums, funcs, aliases, expects;
	for (const auto &c : ast->children)
	{
		if (shouldExport(c))
		{
			if (c->type == ASTNodeType::STRUCT_DECL)
				structs.push_back(c);
			else if (c->type == ASTNodeType::ENUM_DECL)
				enums.push_back(c);
			else if (c->type == ASTNodeType::FUNCTION_DECL)
				funcs.push_back(c);
			else if (c->type == ASTNodeType::TYPE_ALIAS)
				aliases.push_back(c);
			else if (c->type == ASTNodeType::EXPECT_DECL)
				expects.push_back(c);
		}
	}

	if (!structs.empty())
	{
		h << "// Forward declarations\n";
		for (const auto &s : structs)
		{
			if (!s->genericParams.empty())
			{
				h << "template<";
				for (size_t i = 0; i < s->genericParams.size(); i++)
					h << (i ? ", " : "") << "typename " << s->genericParams[i]->value;
				h << ">\n";
			}
			h << "struct " << s->value << ";\n";
		}
		h << "\n";
	}

	for (const auto &a : aliases)
		h << genDecl(ASTConverter::toDecl(a)) << "\n";
	if (!aliases.empty())
		h << "\n";

	for (const auto &e : enums)
		h << genDecl(ASTConverter::toDecl(e)) << "\n\n";

	for (const auto &s : structs)
		h << genDecl(ASTConverter::toDecl(s)) << "\n\n";

	if (!funcs.empty() || !expects.empty())
	{
		h << "// Function declarations\n";
		for (const auto &f : funcs)
		{
			auto typed = ASTConverter::toDecl(f);
			if (auto fp = std::get_if<ast::Function>(&(*typed)))
			{
				if (!fp->genericParams.empty())
				{
					h << "template<";
					for (size_t i = 0; i < fp->genericParams.size(); i++)
						h << (i ? ", " : "") << "typename " << fp->genericParams[i];
					h << ">\n";
				}
				h << genType(fp->returnType) << " " << (fp->name == "main" ? "tuff_main" : fp->name) << "(";
				for (size_t i = 0; i < fp->params.size(); i++)
					h << (i ? ", " : "") << genParamDecl(fp->params[i]);
				h << ");\n";
			}
		}
		for (const auto &e : expects)
		{
			auto typed = ASTConverter::toDecl(e);
			if (auto ep = std::get_if<ast::Expect>(&(*typed)))
			{
				h << genType(ep->returnType) << " " << ep->name << "(";
				for (size_t i = 0; i < ep->params.size(); i++)
					h << (i ? ", " : "") << genParamDecl(ep->params[i]);
				h << ");\n";
			}
		}
		h << "\n";
	}
	return h.str();
}

std::string CodeGeneratorCPP::generateFileImplementation(std::shared_ptr<ASTNode> ast, const std::string &moduleName)
{
	std::stringstream impl;
	impl << "#include \"" << moduleName << ".h\"\n\n";

	for (const auto &c : ast->children)
	{
		if (!shouldExport(c))
		{
			if (c->type == ASTNodeType::STRUCT_DECL || c->type == ASTNodeType::ENUM_DECL)
				impl << genDecl(ASTConverter::toDecl(c)) << "\n\n";
		}
	}

	for (const auto &c : ast->children)
	{
		if (c->type == ASTNodeType::FUNCTION_DECL)
			impl << genDecl(ASTConverter::toDecl(c)) << "\n\n";
		else if (c->type == ASTNodeType::ACTUAL_DECL)
			impl << generateActualDecl(c) << "\n\n";
		else if (c->type == ASTNodeType::IMPL_DECL)
			impl << generateNode(c) << "\n\n";
		else if (c->type == ASTNodeType::MODULE_DECL)
			impl << generateModuleDecl(c) << "\n\n";
	}
	return impl.str();
}
