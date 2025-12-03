#include "codegen_cpp.h"
#include "ast_converter.h"
#include <sstream>
#include <iostream>
#include <fstream>
#include <functional>

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

	// Traverse AST to find all type references
	std::function<void(std::shared_ptr<ASTNode>)> traverse;
	traverse = [&](std::shared_ptr<ASTNode> node)
	{
		if (!node)
			return;

		// Extract from use declarations
		if (node->type == ASTNodeType::USE_DECL)
		{
			deps.insert(node->value);
		}

		// Extract from type strings (inferredType, value for TYPE nodes)
		std::string typeStr = node->inferredType;
		if (node->type == ASTNodeType::TYPE && !node->value.empty())
		{
			typeStr = node->value;
		}

		// Look for stdlib types in type strings
		if (!typeStr.empty())
		{
			if (typeStr.find("Option") != std::string::npos ||
					typeStr.find("Some") != std::string::npos ||
					typeStr.find("None") != std::string::npos)
			{
				deps.insert("option");
			}
			if (typeStr.find("Result") != std::string::npos ||
					typeStr.find("Ok") != std::string::npos ||
					typeStr.find("Err") != std::string::npos)
			{
				deps.insert("result");
			}
			if (typeStr.find("Array") != std::string::npos)
			{
				deps.insert("array");
			}
			if (typeStr.find("Vector") != std::string::npos)
			{
				deps.insert("vector");
			}
			if (typeStr.find("Map") != std::string::npos)
			{
				deps.insert("map");
			}
			if (typeStr.find("string") != std::string::npos)
			{
				deps.insert("string");
			}
			if (typeStr.find("StringBuilder") != std::string::npos)
			{
				deps.insert("string_builder");
			}
			if (typeStr.find("CharStream") != std::string::npos)
			{
				deps.insert("char_stream");
			}
			if (typeStr.find("Allocated") != std::string::npos)
			{
				deps.insert("mem");
			}
		}

		// Recursively traverse children
		for (const auto &child : node->children)
		{
			traverse(child);
		}
	};

	traverse(ast);
	return deps;
}

std::string CodeGeneratorCPP::generateFileHeader(std::shared_ptr<ASTNode> ast, const std::string &moduleName)
{
	std::stringstream h;
	h << "#pragma once\n\n";
	h << "#include <iostream>\n";
	h << "#include <cstdint>\n";
	h << "#include <cstddef>\n";
	h << "#include <cmath>\n";
	h << "#include <cstdlib>\n";
	h << "#include <string>\n";
	h << "#include <memory>\n";
	h << "#include <vector>\n";

	// Handle extern use declarations (e.g., extern use string_builtins;)
	for (const auto &c : ast->children)
	{
		if (c->type == ASTNodeType::EXTERN_USE_DECL)
		{
			h << "#include \"" << c->value << ".h\"\n";
		}
	}
	h << "\n";

	auto deps = extractDependencies(ast);
	// Remove self-reference (don't include own header)
	deps.erase(moduleName);
	if (!deps.empty())
	{
		h << "// Dependencies\n";
		for (const auto &dep : deps)
		{
			std::string hpath = dep;
			size_t pos = 0;
			while ((pos = hpath.find("::")) != std::string::npos)
				hpath.replace(pos, 2, "/");
			// Add tuff_ prefix for last component only
			size_t lastSlash = hpath.find_last_of('/');
			if (lastSlash != std::string::npos)
			{
				hpath = hpath.substr(0, lastSlash + 1) + "tuff_" + hpath.substr(lastSlash + 1);
			}
			else
			{
				hpath = "tuff_" + hpath;
			}
			h << "#include \"" << hpath << ".h\"\n";
		}
		h << "\n";
	}

	std::vector<std::shared_ptr<ASTNode>> structs, enums, funcs, aliases, expects;
	for (const auto &c : ast->children)
	{
		// For per-file headers, export ALL top-level declarations
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

	// Generate function forward declarations
	if (!funcs.empty())
	{
		std::vector<std::shared_ptr<ASTNode>> implFuncs;
		for (const auto &c : ast->children)
		{
			if (c->type == ASTNodeType::IMPL_DECL)
			{
				for (const auto &child : c->children)
				{
					if (child->type == ASTNodeType::FUNCTION_DECL)
					{
						implFuncs.push_back(child);
					}
				}
			}
		}

		std::vector<std::shared_ptr<ASTNode>> allFuncs = funcs;
		allFuncs.insert(allFuncs.end(), implFuncs.begin(), implFuncs.end());

		if (!allFuncs.empty())
		{
			h << "// Function forward declarations\n";
			for (const auto &f : allFuncs)
			{
				h << genFunctionForwardDecl(ASTConverter::toDecl(f)) << "\n";
			}
			h << "\n";
		}
	}

	// Generate inline implementations in header (needed for templates)
	h << "// Implementations\n";

	// Enable inline generation for functions in header
	bool wasInline = generateInline;
	generateInline = true;

	// Collect top-level statements that aren't declarations
	std::vector<std::shared_ptr<ASTNode>> topLevelStmts;
	bool hasMainFunction = false;

	for (const auto &c : ast->children)
	{
		if (c->type == ASTNodeType::FUNCTION_DECL)
		{
			if (c->value == "main")
				hasMainFunction = true;
			h << genDecl(ASTConverter::toDecl(c)) << "\n\n";
		}
		else if (c->type == ASTNodeType::ACTUAL_DECL)
			h << generateActualDecl(c) << "\n\n";
		else if (c->type == ASTNodeType::IMPL_DECL)
			h << generateNode(c) << "\n\n";
		else if (c->type == ASTNodeType::MODULE_DECL)
			h << generateModuleDecl(c) << "\n\n";
		else if (c->type == ASTNodeType::LET_STMT || c->type == ASTNodeType::ASSIGNMENT_STMT ||
				 c->type == ASTNodeType::IF_STMT || c->type == ASTNodeType::WHILE_STMT ||
				 c->type == ASTNodeType::LOOP_STMT || c->type == ASTNodeType::RETURN_STMT ||
				 c->type == ASTNodeType::BREAK_STMT || c->type == ASTNodeType::CONTINUE_STMT ||
				 c->type == ASTNodeType::CALL_EXPR || c->type == ASTNodeType::BINARY_OP ||
				 c->type == ASTNodeType::UNARY_OP || c->type == ASTNodeType::LITERAL ||
				 c->type == ASTNodeType::IDENTIFIER || c->type == ASTNodeType::IF_EXPR ||
				 c->type == ASTNodeType::BLOCK)
		{
			topLevelStmts.push_back(c);
		}
	}

	// If there are top-level statements but no main function, wrap them in main
	if (!topLevelStmts.empty() && !hasMainFunction)
	{
		h << "// Generated main from top-level statements\n";
		h << "inline int tuff_main() {\n";

		// Generate all statements
		for (size_t i = 0; i < topLevelStmts.size(); i++)
		{
			auto stmt = topLevelStmts[i];

			// If this is the last statement and it's an expression, return it
			if (i == topLevelStmts.size() - 1 &&
				(stmt->type == ASTNodeType::CALL_EXPR || stmt->type == ASTNodeType::BINARY_OP ||
				 stmt->type == ASTNodeType::UNARY_OP || stmt->type == ASTNodeType::LITERAL ||
				 stmt->type == ASTNodeType::IDENTIFIER || stmt->type == ASTNodeType::IF_EXPR))
			{
				h << "  return " << generateNode(stmt) << ";\n";
			}
			else
			{
				h << "  " << generateNode(stmt) << ";\n";
			}
		}

		h << "}\n\n";

		// Generate C++ main wrapper
		h << "int main() { return tuff_main(); }\n";
	}

	generateInline = wasInline;

	return h.str();
}

std::string CodeGeneratorCPP::generateFileImplementation(std::shared_ptr<ASTNode> ast, const std::string &moduleName)
{
	std::stringstream impl;
	impl << "#include \"tuff_" << moduleName << ".h\"\n\n";

	// Note: For now, implementation is minimal since most code is in header
	// This is because C++ templates need full definitions in headers
	// TODO: Move non-template implementations here

	return impl.str();
}
