#include "codegen_cpp.h"
#include "ast_converter.h"
#include <sstream>
#include <set>
#include <map>
#include <functional>
#include <iostream>
#include <vector>
#include <memory>

// ============================================================================
// PER-FILE CODE GENERATION
// ============================================================================

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

		// Detect calls to primitive type methods (e.g., line.toString() where line is USize)
		// These are transformed to StructName::methodName format
		if (node->type == ASTNodeType::CALL_EXPR && node->children.size() > 0)
		{
			auto calleeNode = node->children[0];
			if (calleeNode && calleeNode->type == ASTNodeType::IDENTIFIER)
			{
				std::string callee = calleeNode->value;
				// Check if it's a primitive type method call (format: TypeName::methodName)
				if (callee.find("I32::") == 0 || callee.find("I64::") == 0 ||
						callee.find("U32::") == 0 || callee.find("U64::") == 0 ||
						callee.find("USize::") == 0 || callee.find("F32::") == 0 ||
						callee.find("F64::") == 0 || callee.find("Bool::") == 0 ||
						callee.find("I8::") == 0 || callee.find("U8::") == 0 ||
						callee.find("I16::") == 0 || callee.find("U16::") == 0)
				{
					deps.insert("primitives");
				}
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

	// Calculate how many levels deep this module is for relative includes
	int moduleDepth = 0;
	for (char c : moduleName)
	{
		if (c == ':')
			moduleDepth++;
	}
	moduleDepth = moduleDepth / 2; // "::" counts as 2 chars each
	std::string relativePrefix = "";
	for (int i = 0; i < moduleDepth; i++)
	{
		relativePrefix += "../";
	}

	// Handle extern use declarations (e.g., extern use string_builtins;)
	for (const auto &c : ast->children)
	{
		if (c->type == ASTNodeType::EXTERN_USE_DECL)
		{
			h << "#include \"" << relativePrefix << c->value << ".h\"\n";
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
			// Build the include path - always from output root
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

	// Collect all union types used in this file
	std::set<std::string> unionTypes;
	std::function<void(std::shared_ptr<ASTNode>)> collectUnionTypes = [&](std::shared_ptr<ASTNode> node)
	{
		if (!node)
			return;
		if (!node->inferredType.empty() && isUnionType(node->inferredType))
		{
			unionTypes.insert(node->inferredType);
		}
		for (auto child : node->children)
		{
			collectUnionTypes(child);
		}
	};
	collectUnionTypes(ast);

	// Collect local struct names for dependency checking
	std::set<std::string> localStructNames;
	for (const auto &s : structs)
	{
		localStructNames.insert(s->value);
	}

	// Helper to check if a type string depends on any of the local struct names
	auto dependsOn = [&](const std::string &typeStr, const std::set<std::string> &names) -> bool
	{
		for (const auto &name : names)
		{
			// Check for whole word match
			size_t pos = 0;
			while ((pos = typeStr.find(name, pos)) != std::string::npos)
			{
				bool startOk = (pos == 0) || (!isalnum(typeStr[pos - 1]) && typeStr[pos - 1] != '_');
				bool endOk = (pos + name.length() == typeStr.length()) || (!isalnum(typeStr[pos + name.length()]) && typeStr[pos + name.length()] != '_');
				if (startOk && endOk)
					return true;
				pos += name.length();
			}
		}
		return false;
	};

	// Split unions into early (no local deps) and late (local deps)
	std::vector<std::string> earlyUnions, lateUnions;
	for (const auto &unionType : unionTypes)
	{
		if (dependsOn(unionType, localStructNames))
			lateUnions.push_back(unionType);
		else
			earlyUnions.push_back(unionType);
	}

	// Split aliases into early and late
	std::vector<std::shared_ptr<ASTNode>> earlyAliases, lateAliases;
	for (const auto &a : aliases)
	{
		// If it's a union alias AND depends on local structs -> Late
		// Note: We check inferredType (the aliased type)
		bool isUnion = isUnionType(a->inferredType);
		if (isUnion && dependsOn(a->inferredType, localStructNames))
		{
			lateAliases.push_back(a);
		}
		else
		{
			earlyAliases.push_back(a);
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

	// Generate early union struct definitions
	if (!earlyUnions.empty())
	{
		h << "// Early Union type definitions\n";
		for (const auto &unionType : earlyUnions)
		{
			h << generateUnionStruct(unionType, {}) << "\n";
		}
		h << "\n";
	}

	// Generate early aliases
	for (const auto &a : earlyAliases)
		h << genDecl(ASTConverter::toDecl(a)) << "\n";
	if (!earlyAliases.empty())
		h << "\n";

	for (const auto &e : enums)
		h << genDecl(ASTConverter::toDecl(e)) << "\n\n";

	for (const auto &s : structs)
		h << genDecl(ASTConverter::toDecl(s)) << "\n\n";

	// Generate late union struct definitions
	if (!lateUnions.empty())
	{
		h << "// Late Union type definitions\n";
		for (const auto &unionType : lateUnions)
		{
			h << generateUnionStruct(unionType, {}) << "\n";
		}
		h << "\n";
	}

	// Generate late aliases
	for (const auto &a : lateAliases)
		h << genDecl(ASTConverter::toDecl(a)) << "\n";
	if (!lateAliases.empty())
		h << "\n";

	// Generate function forward declarations
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

	// Generate inline implementations in header (needed for templates)
	h << "// Implementations\n";

	// Enable inline generation for functions in header
	bool wasInline = generateInline;
	generateInline = true;

	// Collect top-level statements that aren't declarations
	std::vector<std::shared_ptr<ASTNode>> topLevelStmts;
	bool hasMainFunction = false;
	std::shared_ptr<ASTNode> mainFuncNode = nullptr;

	for (const auto &c : ast->children)
	{
		if (c->type == ASTNodeType::FUNCTION_DECL)
		{
			if (c->value == "main")
			{
				hasMainFunction = true;
				mainFuncNode = c;
			}
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
						 c->type == ASTNodeType::BLOCK || c->type == ASTNodeType::INDEX_EXPR ||
						 c->type == ASTNodeType::FIELD_ACCESS || c->type == ASTNodeType::DEREF_EXPR ||
						 c->type == ASTNodeType::REFERENCE_EXPR || c->type == ASTNodeType::CAST_EXPR ||
						 c->type == ASTNodeType::SIZEOF_EXPR || c->type == ASTNodeType::STRUCT_LITERAL ||
						 c->type == ASTNodeType::ARRAY_LITERAL || c->type == ASTNodeType::STRING_LITERAL ||
						 c->type == ASTNodeType::CHAR_LITERAL || c->type == ASTNodeType::IS_EXPR ||
						 c->type == ASTNodeType::MATCH_EXPR)
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

			// If this is the last statement and it's an expression, return it if it's an integer
			if (i == topLevelStmts.size() - 1 &&
					(stmt->type == ASTNodeType::CALL_EXPR || stmt->type == ASTNodeType::BINARY_OP ||
					 stmt->type == ASTNodeType::UNARY_OP || stmt->type == ASTNodeType::LITERAL ||
					 stmt->type == ASTNodeType::IDENTIFIER || stmt->type == ASTNodeType::IF_EXPR ||
					 stmt->type == ASTNodeType::INDEX_EXPR || stmt->type == ASTNodeType::FIELD_ACCESS ||
					 stmt->type == ASTNodeType::DEREF_EXPR || stmt->type == ASTNodeType::CAST_EXPR ||
					 stmt->type == ASTNodeType::IS_EXPR))
			{
				std::string type = stmt->inferredType;
				if (type == "I32" || type == "int32_t" ||
						type == "U8" || type == "uint8_t" ||
						type == "I8" || type == "int8_t" ||
						type == "U16" || type == "uint16_t" ||
						type == "I16" || type == "int16_t" ||
						type == "Char" || type == "char" ||
						type == "Bool" || type == "bool")
				{
					h << "  return " << generateNode(stmt) << ";\n";
				}
				else
				{
					h << "  " << generateNode(stmt) << ";\n";
					h << "  return 0;\n";
				}
			}
			else
			{
				h << "  " << generateNode(stmt) << ";\n";
			}
		}

		h << "}\n\n";

		// Generate C++ main wrapper
		if (!isLibrary)
			h << "int main() { return tuff_main(); }\n";
	}
	else if (hasMainFunction && !isLibrary)
	{
		// Generate wrapper for user-defined main
		h << "// Generated entry point for user main\n";
		h << "int main() {\n";
		// Check return type of main
		// Note: inferredType might be "Void" or "I32"
		if (mainFuncNode && (mainFuncNode->inferredType == "Void" || mainFuncNode->inferredType == "void"))
		{
			h << "  tuff_main();\n";
			h << "  return 0;\n";
		}
		else
		{
			h << "  return tuff_main();\n";
		}
		h << "}\n";
	}

	generateInline = wasInline;

	return h.str();
}

std::string CodeGeneratorCPP::generateFileImplementation(std::shared_ptr<ASTNode> ast, const std::string &moduleName)
{
	std::stringstream impl;

	// Convert module name to header path (e.g., "compiler::lexer" -> "compiler/tuff_lexer.h")
	std::string hpath = moduleName;
	std::string::size_type pos = 0;
	while ((pos = hpath.find("::", pos)) != std::string::npos)
	{
		hpath.replace(pos, 2, "/");
	}
	// Add tuff_ prefix to the last component
	auto lastSlash = hpath.rfind('/');
	if (lastSlash != std::string::npos)
	{
		hpath = hpath.substr(0, lastSlash + 1) + "tuff_" + hpath.substr(lastSlash + 1);
	}
	else
	{
		hpath = "tuff_" + hpath;
	}

	impl << "#include \"" << hpath << ".h\"\n\n";

	// Note: For now, implementation is minimal since most code is in header
	// This is because C++ templates need full definitions in headers
	// TODO: Move non-template implementations here

	return impl.str();
}
