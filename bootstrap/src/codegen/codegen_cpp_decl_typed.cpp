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
