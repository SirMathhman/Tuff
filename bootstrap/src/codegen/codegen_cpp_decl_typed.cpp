#include "codegen_cpp.h"
#include <sstream>

// ============================================================================
// TYPED DECLARATION CODE GENERATION
// ============================================================================

std::string CodeGeneratorCPP::genDecl(ast::DeclPtr decl)
{
	if (!decl)
		return "";

	return std::visit(ast::Overload{[this](const ast::Function &d) -> std::string
																	{
																		std::stringstream ss;

																		if (!d.genericParams.empty())
																		{
																			ss << "template<";
																			for (size_t i = 0; i < d.genericParams.size(); i++)
																			{
																				if (i > 0)
																					ss << ", ";
																				ss << "typename " << d.genericParams[i];
																			}
																			ss << ">\n";
																		}

																		std::string funcName = (d.name == "main") ? "tuff_main" : d.name;
																		ss << genType(d.returnType) << " " << funcName << "(";

																		for (size_t i = 0; i < d.params.size(); i++)
																		{
																			if (i > 0)
																				ss << ", ";
																			ss << genParamDecl(d.params[i]);
																		}

																		ss << ") ";
																		ss << genFunctionBody(d.body, d.returnType);

																		return ss.str();
																	},

																	[this](const ast::Struct &d) -> std::string
																	{
																		std::stringstream ss;

																		if (!d.genericParams.empty())
																		{
																			ss << "template<";
																			for (size_t i = 0; i < d.genericParams.size(); i++)
																			{
																				if (i > 0)
																					ss << ", ";
																				ss << "typename " << d.genericParams[i];
																			}
																			ss << ">\n";
																		}

																		ss << "struct " << d.name << " {\n";
																		for (const auto &field : d.fields)
																		{
																			std::string typeStr = genType(field.type);
																			// Handle function pointer types specially
																			size_t funcPtrPos = typeStr.find("(*)");
																			if (funcPtrPos != std::string::npos)
																			{
																				std::string retType = typeStr.substr(0, funcPtrPos);
																				std::string params = typeStr.substr(funcPtrPos + 3);
																				while (!retType.empty() && retType.back() == ' ')
																					retType.pop_back();
																				ss << "    " << retType << " (*" << field.name << ")" << params << ";\n";
																			}
																			else
																			{
																				ss << "    " << typeStr << " " << field.name << ";\n";
																			}
																		}
																		ss << "};";
																		return ss.str();
																	},

																	[this](const ast::Enum &d) -> std::string
																	{
																		std::stringstream ss;
																		ss << "enum class " << d.name << " {\n";
																		for (size_t i = 0; i < d.variants.size(); i++)
																		{
																			if (i > 0)
																				ss << ",\n";
																			ss << "    " << d.variants[i];
																		}
																		ss << "\n};";
																		return ss.str();
																	},

																	[this](const ast::Expect &) -> std::string
																	{
																		return "";
																	},

																	[this](const ast::Actual &d) -> std::string
																	{
																		std::stringstream ss;

																		if (!d.genericParams.empty())
																		{
																			ss << "template<";
																			for (size_t i = 0; i < d.genericParams.size(); i++)
																			{
																				if (i > 0)
																					ss << ", ";
																				ss << "typename " << d.genericParams[i];
																			}
																			ss << ">\n";
																		}

																		ss << genType(d.returnType) << " " << d.name << "(";
																		for (size_t i = 0; i < d.params.size(); i++)
																		{
																			if (i > 0)
																				ss << ", ";
																			ss << genParamDecl(d.params[i]);
																		}
																		ss << ") ";
																		ss << genFunctionBody(d.body, d.returnType);

																		return ss.str();
																	},

																	[this](const ast::ExternFn &d) -> std::string
																	{
																		std::stringstream ss;
																		ss << "extern ";

																		if (!d.genericParams.empty())
																		{
																			ss << "template<";
																			for (size_t i = 0; i < d.genericParams.size(); i++)
																			{
																				if (i > 0)
																					ss << ", ";
																				ss << "typename " << d.genericParams[i];
																			}
																			ss << "> ";
																		}

																		ss << genType(d.returnType) << " " << d.name << "(";
																		for (size_t i = 0; i < d.params.size(); i++)
																		{
																			if (i > 0)
																				ss << ", ";
																			ss << genParamDecl(d.params[i]);
																		}
																		ss << ");";
																		return ss.str();
																	},

																	[this](const ast::TypeAlias &d) -> std::string
																	{
																		// Check if this is a union type alias
																		if (d.aliasedType && std::holds_alternative<ast::UnionType>(*d.aliasedType))
																		{
																			// Union types need a tagged union struct, not a simple alias
																			return generateUnionStructFromType(d.name, d.aliasedType, d.genericParams);
																		}

																		// Check if this is an intersection type alias
																		if (d.aliasedType && std::holds_alternative<ast::IntersectionType>(*d.aliasedType))
																		{
																			// Intersection types: extract the first non-destructor member as the actual type
																			const auto &it = std::get<ast::IntersectionType>(*d.aliasedType);
																			ast::TypePtr actualType = nullptr;
																			for (const auto &member : it.members)
																			{
																				// Skip destructor markers (NamedType starting with #)
																				if (member && std::holds_alternative<ast::NamedType>(*member))
																				{
																					const auto &nt = std::get<ast::NamedType>(*member);
																					if (!nt.name.empty() && nt.name[0] == '#')
																						continue;
																				}
																				actualType = member;
																				break;
																			}

																			if (actualType)
																			{
																				std::stringstream ss;
																				if (!d.genericParams.empty())
																				{
																					ss << "template<";
																					for (size_t i = 0; i < d.genericParams.size(); i++)
																					{
																						if (i > 0)
																							ss << ", ";
																						ss << "typename " << d.genericParams[i];
																					}
																					ss << ">\n";
																				}
																				ss << "using " << d.name << " = " << genType(actualType) << ";";
																				return ss.str();
																			}
																		}

																		std::stringstream ss;

																		if (!d.genericParams.empty())
																		{
																			ss << "template<";
																			for (size_t i = 0; i < d.genericParams.size(); i++)
																			{
																				if (i > 0)
																					ss << ", ";
																				ss << "typename " << d.genericParams[i];
																			}
																			ss << ">\n";
																		}

																		ss << "using " << d.name << " = " << genType(d.aliasedType) << ";";
																		return ss.str();
																	},

																	[this](const ast::Module &d) -> std::string
																	{
																		std::stringstream ss;
																		ss << "namespace " << d.name << " {\n";
																		for (const auto &child : d.declarations)
																			ss << genDecl(child) << "\n";
																		ss << "}";
																		return ss.str();
																	},

																	[this](const ast::Use &) -> std::string
																	{
																		return "";
																	}},
										*decl);
}
