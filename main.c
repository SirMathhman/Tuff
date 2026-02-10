/*
 * Tuff Bootstrap Compiler
 *
 * A minimal compiler that translates Tuff source code to C.
 * This entire bootstrap compiler is contained in a single file for simplicity.
 * As we build out the Tuff standard library and compiler modules in Tuff itself,
 * we'll gradually replace sections of this C code with compiled Tuff code.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include <ctype.h>
#include <assert.h>

// ============================================================================
// UTILITIES
// ============================================================================

// Simple dynamic string
typedef struct
{
    char *data;
    size_t length;
    size_t capacity;
} String;

String string_new(void)
{
    String s = {0};
    s.capacity = 32;
    s.data = malloc(s.capacity);
    s.data[0] = '\0';
    return s;
}

void string_append_char(String *s, char c)
{
    if (s->length + 2 > s->capacity)
    {
        s->capacity *= 2;
        s->data = realloc(s->data, s->capacity);
    }
    s->data[s->length++] = c;
    s->data[s->length] = '\0';
}

void string_append_cstr(String *s, const char *cstr)
{
    size_t len = strlen(cstr);
    size_t new_length = s->length + len;
    if (new_length + 1 > s->capacity)
    {
        while (s->capacity <= new_length)
        {
            s->capacity *= 2;
        }
        s->data = realloc(s->data, s->capacity);
    }
    memcpy(s->data + s->length, cstr, len);
    s->length = new_length;
    s->data[s->length] = '\0';
}

void string_free(String *s)
{
    free(s->data);
    s->data = NULL;
    s->length = 0;
    s->capacity = 0;
}

// Read entire file into string
String read_file(const char *path)
{
    FILE *f = fopen(path, "rb");
    if (!f)
    {
        fprintf(stderr, "Error: Cannot open file '%s'\n", path);
        exit(1);
    }

    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);

    String content = {0};
    content.capacity = size + 1;
    content.length = size;
    content.data = malloc(content.capacity);

    fread(content.data, 1, size, f);
    content.data[size] = '\0';

    fclose(f);
    return content;
}

void write_file(const char *path, const char *content)
{
    FILE *f = fopen(path, "w");
    if (!f)
    {
        fprintf(stderr, "Error: Cannot write file '%s'\n", path);
        exit(1);
    }
    fputs(content, f);
    fclose(f);
}

void string_append_range(String *s, const char *start, size_t length)
{
    size_t new_length = s->length + length;
    if (new_length + 1 > s->capacity)
    {
        while (s->capacity <= new_length)
        {
            s->capacity *= 2;
        }
        s->data = realloc(s->data, s->capacity);
    }
    memcpy(s->data + s->length, start, length);
    s->length = new_length;
    s->data[s->length] = '\0';
}

// ============================================================================
// LEXER
// ============================================================================

typedef enum
{
    // Literals
    TOK_IDENT,
    TOK_NUMBER,
    TOK_STRING,
    TOK_CHAR,

    // Keywords
    TOK_FN,
    TOK_LET,
    TOK_STRUCT,
    TOK_TYPE,
    TOK_MATCH,
    TOK_CASE,
    TOK_IF,
    TOK_ELSE,
    TOK_WHILE,
    TOK_FOR,
    TOK_LOOP,
    TOK_IN,
    TOK_BREAK,
    TOK_CONTINUE,
    TOK_RETURN,
    TOK_EXTERN,
    TOK_OUT,
    TOK_OBJECT,
    TOK_CONTRACT,
    TOK_IMPL,
    TOK_IS,
    TOK_TRUE,
    TOK_FALSE,
    TOK_NULL,

    // Operators
    TOK_PLUS,      // +
    TOK_MINUS,     // -
    TOK_STAR,      // *
    TOK_SLASH,     // /
    TOK_PERCENT,   // %
    TOK_EQ,        // ==
    TOK_NE,        // !=
    TOK_LT,        // <
    TOK_GT,        // >
    TOK_LE,        // <=
    TOK_GE,        // >=
    TOK_AND,       // &&
    TOK_OR,        // ||
    TOK_NOT,       // !
    TOK_AMPERSAND, // &
    TOK_ASSIGN,    // =
    TOK_PLUSEQ,    // +=
    TOK_MINUSEQ,   // -=
    TOK_STAREQ,    // *=
    TOK_SLASHEQ,   // /=
    TOK_PERCENTEQ, // %=
    TOK_ARROW,     // =>
    TOK_PIPE,      // |
    TOK_PIPEGT,    // |>
    TOK_RANGE,     // ..
    TOK_QUESTION,  // ?

    // Delimiters
    TOK_LPAREN,     // (
    TOK_RPAREN,     // )
    TOK_LBRACE,     // {
    TOK_RBRACE,     // }
    TOK_LBRACKET,   // [
    TOK_RBRACKET,   // ]
    TOK_COMMA,      // ,
    TOK_COLON,      // :
    TOK_SEMICOLON,  // ;
    TOK_DOT,        // .
    TOK_COLONCOLON, // ::

    TOK_EOF,
    TOK_ERROR
} TokenKind;

typedef struct
{
    TokenKind kind;
    const char *start;
    size_t length;
    size_t line;
    size_t column;
} Token;

typedef struct
{
    const char *source;
    const char *current;
    size_t line;
    size_t column;
    size_t start_column;
} Lexer;

Lexer lexer_new(const char *source)
{
    Lexer lexer = {0};
    lexer.source = source;
    lexer.current = source;
    lexer.line = 1;
    lexer.column = 1;
    return lexer;
}

static bool is_at_end(Lexer *lexer)
{
    return *lexer->current == '\0';
}

static char peek(Lexer *lexer)
{
    return *lexer->current;
}

static char peek_next(Lexer *lexer)
{
    if (is_at_end(lexer))
        return '\0';
    return lexer->current[1];
}

static char advance(Lexer *lexer)
{
    char c = *lexer->current++;
    lexer->column++;
    return c;
}

static bool match(Lexer *lexer, char expected)
{
    if (is_at_end(lexer))
        return false;
    if (*lexer->current != expected)
        return false;
    advance(lexer);
    return true;
}

static void skip_whitespace(Lexer *lexer)
{
    for (;;)
    {
        char c = peek(lexer);
        switch (c)
        {
        case ' ':
        case '\r':
        case '\t':
            advance(lexer);
            break;
        case '\n':
            lexer->line++;
            lexer->column = 0;
            advance(lexer);
            break;
        case '/':
            if (peek_next(lexer) == '/')
            {
                // Line comment
                while (peek(lexer) != '\n' && !is_at_end(lexer))
                {
                    advance(lexer);
                }
            }
            else if (peek_next(lexer) == '*')
            {
                // Block comment
                advance(lexer); // /
                advance(lexer); // *
                while (!is_at_end(lexer))
                {
                    if (peek(lexer) == '*' && peek_next(lexer) == '/')
                    {
                        advance(lexer);
                        advance(lexer);
                        break;
                    }
                    if (peek(lexer) == '\n')
                    {
                        lexer->line++;
                        lexer->column = 0;
                    }
                    advance(lexer);
                }
            }
            else
            {
                return;
            }
            break;
        default:
            return;
        }
    }
}

static Token make_token(Lexer *lexer, TokenKind kind)
{
    Token token = {0};
    token.kind = kind;
    token.start = lexer->source + (lexer->current - lexer->source - 1);
    token.length = 1;
    token.line = lexer->line;
    token.column = lexer->start_column;
    return token;
}

static Token make_token_range(Lexer *lexer, TokenKind kind, const char *start, size_t length)
{
    Token token = {0};
    token.kind = kind;
    token.start = start;
    token.length = length;
    token.line = lexer->line;
    token.column = lexer->start_column;
    return token;
}

static TokenKind check_keyword(const char *start, size_t length, const char *rest, TokenKind kind)
{
    if (strlen(rest) == length && memcmp(start, rest, length) == 0)
    {
        return kind;
    }
    return TOK_IDENT;
}

static TokenKind identifier_type(const char *start, size_t length)
{
    // Simple keyword checking
    switch (start[0])
    {
    case 'b':
        return check_keyword(start, length, "break", TOK_BREAK);
    case 'c':
        if (length > 1)
        {
            switch (start[1])
            {
            case 'a':
                return check_keyword(start, length, "case", TOK_CASE);
            case 'o':
                if (length > 2 && start[2] == 'n')
                {
                    if (length > 3 && start[3] == 't')
                    {
                        return check_keyword(start, length, "contract", TOK_CONTRACT);
                    }
                    return check_keyword(start, length, "continue", TOK_CONTINUE);
                }
                break;
            }
        }
        break;
    case 'e':
        if (length > 1)
        {
            switch (start[1])
            {
            case 'l':
                return check_keyword(start, length, "else", TOK_ELSE);
            case 'x':
                return check_keyword(start, length, "extern", TOK_EXTERN);
            }
        }
        break;
    case 'f':
        if (length > 1)
        {
            switch (start[1])
            {
            case 'a':
                return check_keyword(start, length, "false", TOK_FALSE);
            case 'n':
                return check_keyword(start, length, "fn", TOK_FN);
            case 'o':
                return check_keyword(start, length, "for", TOK_FOR);
            }
        }
        break;
    case 'i':
        if (length > 1)
        {
            switch (start[1])
            {
            case 'f':
                return check_keyword(start, length, "if", TOK_IF);
            case 'm':
                return check_keyword(start, length, "impl", TOK_IMPL);
            case 'n':
                return check_keyword(start, length, "in", TOK_IN);
            case 's':
                return check_keyword(start, length, "is", TOK_IS);
            }
        }
        break;
    case 'l':
        if (length > 1)
        {
            switch (start[1])
            {
            case 'e':
                return check_keyword(start, length, "let", TOK_LET);
            case 'o':
                return check_keyword(start, length, "loop", TOK_LOOP);
            }
        }
        break;
    case 'm':
        return check_keyword(start, length, "match", TOK_MATCH);
    case 'n':
        return check_keyword(start, length, "null", TOK_NULL);
    case 'o':
        if (length > 1)
        {
            switch (start[1])
            {
            case 'b':
                return check_keyword(start, length, "object", TOK_OBJECT);
            case 'u':
                return check_keyword(start, length, "out", TOK_OUT);
            }
        }
        break;
    case 'r':
        return check_keyword(start, length, "return", TOK_RETURN);
    case 's':
        return check_keyword(start, length, "struct", TOK_STRUCT);
    case 't':
        if (length > 1)
        {
            switch (start[1])
            {
            case 'r':
                return check_keyword(start, length, "true", TOK_TRUE);
            case 'y':
                return check_keyword(start, length, "type", TOK_TYPE);
            }
        }
        break;
    case 'w':
        return check_keyword(start, length, "while", TOK_WHILE);
    }
    return TOK_IDENT;
}

Token lexer_next_token(Lexer *lexer)
{
    skip_whitespace(lexer);

    lexer->start_column = lexer->column;
    const char *start = lexer->current;

    if (is_at_end(lexer))
    {
        return make_token(lexer, TOK_EOF);
    }

    char c = advance(lexer);

    // Identifiers and keywords
    if (isalpha(c) || c == '_')
    {
        while (isalnum(peek(lexer)) || peek(lexer) == '_')
        {
            advance(lexer);
        }
        size_t length = lexer->current - start;
        TokenKind kind = identifier_type(start, length);
        return make_token_range(lexer, kind, start, length);
    }

    // Numbers
    if (isdigit(c))
    {
        // Hex, binary, octal
        if (c == '0')
        {
            if (peek(lexer) == 'x' || peek(lexer) == 'X')
            {
                advance(lexer);
                while (isxdigit(peek(lexer)))
                    advance(lexer);
            }
            else if (peek(lexer) == 'b' || peek(lexer) == 'B')
            {
                advance(lexer);
                while (peek(lexer) == '0' || peek(lexer) == '1')
                    advance(lexer);
            }
            else if (peek(lexer) == 'o' || peek(lexer) == 'O')
            {
                advance(lexer);
                while (peek(lexer) >= '0' && peek(lexer) <= '7')
                    advance(lexer);
            }
        }

        while (isdigit(peek(lexer)))
            advance(lexer);

        // Float
        if (peek(lexer) == '.' && isdigit(peek_next(lexer)))
        {
            advance(lexer);
            while (isdigit(peek(lexer)))
                advance(lexer);
        }

        // Exponent
        if (peek(lexer) == 'e' || peek(lexer) == 'E')
        {
            advance(lexer);
            if (peek(lexer) == '+' || peek(lexer) == '-')
                advance(lexer);
            while (isdigit(peek(lexer)))
                advance(lexer);
        }

        size_t length = lexer->current - start;
        return make_token_range(lexer, TOK_NUMBER, start, length);
    }

    // String literals
    if (c == '"')
    {
        while (peek(lexer) != '"' && !is_at_end(lexer))
        {
            if (peek(lexer) == '\n')
            {
                lexer->line++;
                lexer->column = 0;
            }
            if (peek(lexer) == '\\')
                advance(lexer);
            advance(lexer);
        }

        if (is_at_end(lexer))
        {
            fprintf(stderr, "Unterminated string at line %zu\n", lexer->line);
            return make_token(lexer, TOK_ERROR);
        }

        advance(lexer); // Closing "
        size_t length = lexer->current - start;
        return make_token_range(lexer, TOK_STRING, start, length);
    }

    // Char literals
    if (c == '\'')
    {
        if (peek(lexer) == '\\')
            advance(lexer);
        advance(lexer);
        if (peek(lexer) != '\'')
        {
            fprintf(stderr, "Unterminated char at line %zu\n", lexer->line);
            return make_token(lexer, TOK_ERROR);
        }
        advance(lexer);
        size_t length = lexer->current - start;
        return make_token_range(lexer, TOK_CHAR, start, length);
    }

    // Operators and punctuation
    switch (c)
    {
    case '(':
        return make_token(lexer, TOK_LPAREN);
    case ')':
        return make_token(lexer, TOK_RPAREN);
    case '{':
        return make_token(lexer, TOK_LBRACE);
    case '}':
        return make_token(lexer, TOK_RBRACE);
    case '[':
        return make_token(lexer, TOK_LBRACKET);
    case ']':
        return make_token(lexer, TOK_RBRACKET);
    case ',':
        return make_token(lexer, TOK_COMMA);
    case ';':
        return make_token(lexer, TOK_SEMICOLON);
    case '?':
        return make_token(lexer, TOK_QUESTION);
    case '%':
        return make_token(lexer, match(lexer, '=') ? TOK_PERCENTEQ : TOK_PERCENT);
    case '+':
        return make_token(lexer, match(lexer, '=') ? TOK_PLUSEQ : TOK_PLUS);
    case '-':
        return make_token(lexer, match(lexer, '=') ? TOK_MINUSEQ : TOK_MINUS);
    case '*':
        return make_token(lexer, match(lexer, '=') ? TOK_STAREQ : TOK_STAR);
    case '/':
        return make_token(lexer, match(lexer, '=') ? TOK_SLASHEQ : TOK_SLASH);
    case '!':
        return make_token(lexer, match(lexer, '=') ? TOK_NE : TOK_NOT);
    case '=':
        if (match(lexer, '='))
            return make_token(lexer, TOK_EQ);
        if (match(lexer, '>'))
            return make_token(lexer, TOK_ARROW);
        return make_token(lexer, TOK_ASSIGN);
    case '<':
        return make_token(lexer, match(lexer, '=') ? TOK_LE : TOK_LT);
    case '>':
        return make_token(lexer, match(lexer, '=') ? TOK_GE : TOK_GT);
    case '&':
        if (match(lexer, '&'))
            return make_token(lexer, TOK_AND);
        return make_token(lexer, TOK_AMPERSAND);
    case '|':
        if (match(lexer, '|'))
            return make_token(lexer, TOK_OR);
        if (match(lexer, '>'))
            return make_token(lexer, TOK_PIPEGT);
        return make_token(lexer, TOK_PIPE);
    case ':':
        if (match(lexer, ':'))
            return make_token(lexer, TOK_COLONCOLON);
        return make_token(lexer, TOK_COLON);
    case '.':
        if (match(lexer, '.'))
            return make_token(lexer, TOK_RANGE);
        return make_token(lexer, TOK_DOT);
    }

    fprintf(stderr, "Unexpected character '%c' at line %zu\n", c, lexer->line);
    return make_token(lexer, TOK_ERROR);
}

// ============================================================================
// AST
// ============================================================================

typedef enum
{
    TYPE_VOID,
    TYPE_I32,
    TYPE_BOOL,
    TYPE_STRPTR,
    TYPE_STRUCT,
    TYPE_ARRAY,
    TYPE_POINTER
} TypeKind;

typedef struct Type Type;

struct Type
{
    TypeKind kind;
    union
    {
        String struct_name; // For TYPE_STRUCT
        struct
        {
            Type *element_type; // For TYPE_ARRAY
            int array_size;     // -1 for dynamic arrays
        } array_info;
        Type *pointer_to; // For TYPE_POINTER
    } data;
};

typedef enum
{
    EXPR_NUMBER,
    EXPR_STRING,
    EXPR_BOOL,
    EXPR_NULL,
    EXPR_IDENT,
    EXPR_CALL,
    EXPR_BINARY,
    EXPR_UNARY,
    EXPR_ADDRESS_OF,
    EXPR_DEREF,
    EXPR_MEMBER_ACCESS,
    EXPR_STRUCT_LITERAL,
    EXPR_ARRAY_LITERAL,
    EXPR_INDEX,
    EXPR_CAST
} ExprKind;

typedef struct Expr Expr;

typedef struct
{
    TokenKind op;
    Expr *left;
    Expr *right;
} ExprBinary;

typedef struct
{
    TokenKind op;
    Expr *value;
} ExprUnary;

typedef struct
{
    String name;
    Expr **args;
    size_t arg_count;
} ExprCall;

typedef struct
{
    Expr *object;
    String member_name;
} ExprMemberAccess;

typedef struct
{
    String type_name;
    String *field_names;
    Expr **field_values;
    size_t field_count;
} ExprStructLiteral;

typedef struct
{
    Expr **elements;
    size_t element_count;
} ExprArrayLiteral;

typedef struct
{
    Expr *array;
    Expr *index;
} ExprIndex;

typedef struct
{
    Type target_type;
    Expr *expr;
} ExprCast;

typedef struct Expr
{
    ExprKind kind;
    Token token;
    union
    {
        int64_t number_value;
        String string_value;
        bool bool_value;
        String ident;
        ExprCall call;
        ExprBinary binary;
        ExprUnary unary;
        ExprMemberAccess member_access;
        ExprStructLiteral struct_literal;
        ExprArrayLiteral array_literal;
        ExprIndex index;
        ExprCast cast;
    } as;
} Expr;

typedef enum
{
    STMT_EXPR,
    STMT_RETURN,
    STMT_LET,
    STMT_ASSIGN,
    STMT_IF,
    STMT_WHILE,
    STMT_LOOP,
    STMT_FOR,
    STMT_BREAK,
    STMT_CONTINUE
} StmtKind;

typedef struct Stmt
{
    StmtKind kind;
    union
    {
        Expr *expr;
        struct
        {
            String name;
            Type type;
            Expr *value;
        } let_stmt;
        struct
        {
            String name;
            Expr *value;
        } assign_stmt;
        struct
        {
            Expr *condition;
            struct Stmt **then_branch;
            size_t then_count;
            struct Stmt **else_branch;
            size_t else_count;
        } if_stmt;
        struct
        {
            Expr *condition;
            struct Stmt **body;
            size_t body_count;
        } while_stmt;
        struct
        {
            struct Stmt **body;
            size_t body_count;
        } loop_stmt;
        struct
        {
            String var_name;
            Expr *start;
            Expr *end;
            struct Stmt **body;
            size_t body_count;
        } for_stmt;
    } as;
} Stmt;

typedef struct
{
    String name;
    Type type;
} Param;

typedef struct
{
    String name;
    Param *params;
    size_t param_count;
    Type return_type;
    Stmt **body;
    size_t body_count;
    bool is_extern;
} FunctionDecl;

typedef struct
{
    String name;
    Type type;
} Field;

typedef struct
{
    String name;
    Field *fields;
    size_t field_count;
} StructDecl;

typedef struct
{
    StructDecl **structs;
    size_t struct_count;
    FunctionDecl **functions;
    size_t function_count;
} Program;

// ============================================================================
// PARSER
// ============================================================================

typedef struct
{
    void **items;
    size_t count;
    size_t capacity;
} PtrVec;

static void ptrvec_init(PtrVec *v)
{
    v->items = NULL;
    v->count = 0;
    v->capacity = 0;
}

static void ptrvec_push(PtrVec *v, void *item)
{
    if (v->count + 1 > v->capacity)
    {
        v->capacity = v->capacity == 0 ? 8 : v->capacity * 2;
        v->items = realloc(v->items, v->capacity * sizeof(void *));
    }
    v->items[v->count++] = item;
}

typedef struct
{
    Lexer lexer;
    Token current;
    Token previous;
    bool had_error;
    bool panic_mode;
} Parser;

static void parser_init(Parser *parser, const char *source)
{
    parser->lexer = lexer_new(source);
    parser->had_error = false;
    parser->panic_mode = false;
    parser->current = lexer_next_token(&parser->lexer);
}

static void parser_error_at(Parser *parser, Token token, const char *message)
{
    if (parser->panic_mode)
        return;
    parser->panic_mode = true;
    parser->had_error = true;

    fprintf(stderr, "[line %zu] Error", token.line);
    if (token.kind == TOK_EOF)
    {
        fprintf(stderr, " at end");
    }
    else if (token.kind == TOK_ERROR)
    {
        // Nothing
    }
    else
    {
        fprintf(stderr, " at '%.*s'", (int)token.length, token.start);
    }
    fprintf(stderr, ": %s\n", message);
}

static void parser_advance(Parser *parser)
{
    parser->previous = parser->current;

    for (;;)
    {
        parser->current = lexer_next_token(&parser->lexer);
        if (parser->current.kind != TOK_ERROR)
            break;
        parser_error_at(parser, parser->current, "Unexpected token");
    }
}

static bool parser_check(Parser *parser, TokenKind kind)
{
    return parser->current.kind == kind;
}

static bool parser_match(Parser *parser, TokenKind kind)
{
    if (!parser_check(parser, kind))
        return false;
    parser_advance(parser);
    return true;
}

static Token parser_consume(Parser *parser, TokenKind kind, const char *message)
{
    if (parser_check(parser, kind))
    {
        parser_advance(parser);
        return parser->previous;
    }
    parser_error_at(parser, parser->current, message);
    return parser->current;
}

static bool token_is_ident(Token token, const char *text)
{
    size_t len = strlen(text);
    return token.length == len && memcmp(token.start, text, len) == 0;
}

static String token_to_string(Token token)
{
    String s = string_new();
    string_append_range(&s, token.start, token.length);
    return s;
}

static Type parse_type(Parser *parser)
{
    // Check for array type: [T; N]
    if (parser_match(parser, TOK_LBRACKET))
    {
        Type *elem_type = malloc(sizeof(Type));
        *elem_type = parse_type(parser);
        parser_consume(parser, TOK_SEMICOLON, "Expected ';' in array type");
        Token size_token = parser_consume(parser, TOK_NUMBER, "Expected array size");
        int size = (int)strtoll(size_token.start, NULL, 10);
        parser_consume(parser, TOK_RBRACKET, "Expected ']' after array type");

        Type array_type;
        array_type.kind = TYPE_ARRAY;
        array_type.data.array_info.element_type = elem_type;
        array_type.data.array_info.array_size = size;
        return array_type;
    }

    bool is_ptr = false;
    if (parser_match(parser, TOK_STAR))
    {
        is_ptr = true;
    }

    Token ident = parser_consume(parser, TOK_IDENT, "Expected type name");
    Type base_type;
    if (token_is_ident(ident, "Void"))
    {
        base_type.kind = TYPE_VOID;
    }
    else if (token_is_ident(ident, "I32"))
    {
        base_type.kind = TYPE_I32;
    }
    else if (token_is_ident(ident, "Bool"))
    {
        base_type.kind = TYPE_BOOL;
    }
    else if (token_is_ident(ident, "Str") && is_ptr)
    {
        // Special case: *Str is TYPE_STRPTR
        Type t;
        t.kind = TYPE_STRPTR;
        return t;
    }
    else
    {
        // Assume it's a struct type
        base_type.kind = TYPE_STRUCT;
        base_type.data.struct_name = string_new();
        string_append_range(&base_type.data.struct_name, ident.start, ident.length);
    }

    // If we saw *, wrap in pointer type
    if (is_ptr)
    {
        Type ptr_type;
        ptr_type.kind = TYPE_POINTER;
        ptr_type.data.pointer_to = malloc(sizeof(Type));
        *ptr_type.data.pointer_to = base_type;
        return ptr_type;
    }

    return base_type;
}

static Expr *parse_expression(Parser *parser);
static Expr *parse_unary(Parser *parser);

static Expr *expr_new(ExprKind kind)
{
    Expr *expr = calloc(1, sizeof(Expr));
    expr->kind = kind;
    return expr;
}

static Expr *parse_primary(Parser *parser)
{
    if (parser_match(parser, TOK_NUMBER))
    {
        Expr *expr = expr_new(EXPR_NUMBER);
        expr->token = parser->previous;
        expr->as.number_value = strtoll(parser->previous.start, NULL, 10);
        return expr;
    }

    if (parser_match(parser, TOK_STRING))
    {
        Expr *expr = expr_new(EXPR_STRING);
        expr->token = parser->previous;
        expr->as.string_value = token_to_string(parser->previous);
        return expr;
    }

    if (parser_match(parser, TOK_TRUE))
    {
        Expr *expr = expr_new(EXPR_BOOL);
        expr->token = parser->previous;
        expr->as.bool_value = true;
        return expr;
    }

    if (parser_match(parser, TOK_FALSE))
    {
        Expr *expr = expr_new(EXPR_BOOL);
        expr->token = parser->previous;
        expr->as.bool_value = false;
        return expr;
    }

    if (parser_match(parser, TOK_NULL))
    {
        Expr *expr = expr_new(EXPR_NULL);
        expr->token = parser->previous;
        return expr;
    }

    if (parser_match(parser, TOK_IDENT))
    {
        Token ident = parser->previous;
        if (parser_match(parser, TOK_LPAREN))
        {
            Expr *expr = expr_new(EXPR_CALL);
            expr->token = ident;
            expr->as.call.name = token_to_string(ident);

            PtrVec args;
            ptrvec_init(&args);
            if (!parser_check(parser, TOK_RPAREN))
            {
                do
                {
                    Expr *arg = parse_expression(parser);
                    ptrvec_push(&args, arg);
                } while (parser_match(parser, TOK_COMMA));
            }
            parser_consume(parser, TOK_RPAREN, "Expected ')' after arguments");

            expr->as.call.args = (Expr **)args.items;
            expr->as.call.arg_count = args.count;
            return expr;
        }

        if (parser_match(parser, TOK_LBRACE))
        {
            // Struct literal: TypeName { field1: value1, field2: value2 }
            Expr *expr = expr_new(EXPR_STRUCT_LITERAL);
            expr->token = ident;
            expr->as.struct_literal.type_name = token_to_string(ident);

            PtrVec field_names;
            ptrvec_init(&field_names);
            PtrVec field_values;
            ptrvec_init(&field_values);

            if (!parser_check(parser, TOK_RBRACE))
            {
                do
                {
                    Token field_name = parser_consume(parser, TOK_IDENT, "Expected field name");
                    String *name_ptr = malloc(sizeof(String));
                    *name_ptr = token_to_string(field_name);
                    ptrvec_push(&field_names, name_ptr);

                    parser_consume(parser, TOK_COLON, "Expected ':' after field name");

                    Expr *value = parse_expression(parser);
                    ptrvec_push(&field_values, value);
                } while (parser_match(parser, TOK_COMMA));
            }

            parser_consume(parser, TOK_RBRACE, "Expected '}' after struct literal");

            // Convert String* array to String array
            expr->as.struct_literal.field_count = field_names.count;
            expr->as.struct_literal.field_names = malloc(field_names.count * sizeof(String));
            for (size_t i = 0; i < field_names.count; i++)
            {
                expr->as.struct_literal.field_names[i] = *(String *)field_names.items[i];
            }
            expr->as.struct_literal.field_values = (Expr **)field_values.items;
            return expr;
        }

        Expr *expr = expr_new(EXPR_IDENT);
        expr->token = ident;
        expr->as.ident = token_to_string(ident);
        return expr;
    }

    if (parser_match(parser, TOK_LBRACKET))
    {
        // Array literal: [expr1, expr2, expr3]
        Expr *expr = expr_new(EXPR_ARRAY_LITERAL);
        expr->token = parser->previous;

        PtrVec elements;
        ptrvec_init(&elements);

        if (!parser_check(parser, TOK_RBRACKET))
        {
            do
            {
                Expr *elem = parse_expression(parser);
                ptrvec_push(&elements, elem);
            } while (parser_match(parser, TOK_COMMA));
        }

        parser_consume(parser, TOK_RBRACKET, "Expected ']' after array literal");

        expr->as.array_literal.elements = (Expr **)elements.items;
        expr->as.array_literal.element_count = elements.count;
        return expr;
    }

    if (parser_match(parser, TOK_LPAREN))
    {
        // Try to determine if this is a type cast (Type)expr or grouped expression (expr)
        // We'll use a simple approach: try to parse it as a cast, and if we see a closing paren
        // followed by a unary expression that starts a new expression, it's a cast.
        // Otherwise it's a grouped expression.

        // Peek at first token to make an educated guess
        bool might_be_cast = false;

        // Check if first token after ( looks like it could start a type
        // Types can start with: *, or an identifier (like I32, Bool, [, etc.)
        if (parser_check(parser, TOK_STAR) || parser_check(parser, TOK_LBRACKET))
        {
            might_be_cast = true;
        }
        // For simple identifiers, we need to peek further, but for now we'll try a different heuristic:
        // If it's an identifier followed by ] or ), it's likely a type cast
        if (parser_check(parser, TOK_IDENT))
        {
            // We can't easily peek two tokens ahead, so we'll let parse_type handle the decision
            // by attempting to parse as cast and seeing if it works
            might_be_cast = true;
        }

        if (might_be_cast)
        {
            // Try to parse as a cast expression
            Type target_type = parse_type(parser);
            if (parser_match(parser, TOK_RPAREN))
            {
                // It was a cast!
                Expr *cast_expr = expr_new(EXPR_CAST);
                cast_expr->as.cast.target_type = target_type;
                cast_expr->as.cast.expr = parse_unary(parser);
                return cast_expr;
            }
            // If we didn't find RPAREN, this was not a cast - but we've already consumed
            // tokens trying to parse the type. This is a parser error.
            // In a production parser, we'd have backtracking. For now we'll just error.
            parser_error_at(parser, parser->current, "Expected ')'");
            return expr_new(EXPR_NUMBER);
        }
        else
        {
            // Parse as grouped expression
            Expr *expr = parse_expression(parser);
            parser_consume(parser, TOK_RPAREN, "Expected ')' after expression");
            return expr;
        }
    }

    parser_error_at(parser, parser->current, "Expected expression");
    return expr_new(EXPR_NUMBER);
}

static Expr *parse_unary(Parser *parser)
{
    if (parser_match(parser, TOK_NOT) || parser_match(parser, TOK_MINUS))
    {
        Expr *expr = expr_new(EXPR_UNARY);
        expr->token = parser->previous;
        expr->as.unary.op = parser->previous.kind;
        expr->as.unary.value = parse_unary(parser);
        return expr;
    }

    if (parser_match(parser, TOK_AMPERSAND))
    {
        Expr *expr = expr_new(EXPR_ADDRESS_OF);
        expr->token = parser->previous;
        expr->as.unary.value = parse_unary(parser);
        return expr;
    }

    if (parser_match(parser, TOK_STAR))
    {
        Expr *expr = expr_new(EXPR_DEREF);
        expr->token = parser->previous;
        expr->as.unary.value = parse_unary(parser);
        return expr;
    }

    // Handle postfix operators (member access, array indexing)
    Expr *expr = parse_primary(parser);
    while (true)
    {
        if (parser_match(parser, TOK_DOT))
        {
            Token member = parser_consume(parser, TOK_IDENT, "Expected field name after '.'");
            Expr *member_expr = expr_new(EXPR_MEMBER_ACCESS);
            member_expr->token = member;
            member_expr->as.member_access.object = expr;
            member_expr->as.member_access.member_name = token_to_string(member);
            expr = member_expr;
        }
        else if (parser_match(parser, TOK_LBRACKET))
        {
            Expr *index_expr = expr_new(EXPR_INDEX);
            index_expr->token = parser->previous;
            index_expr->as.index.array = expr;
            index_expr->as.index.index = parse_expression(parser);
            parser_consume(parser, TOK_RBRACKET, "Expected ']' after array index");
            expr = index_expr;
        }
        else
        {
            break;
        }
    }
    return expr;
}

static Expr *parse_factor(Parser *parser)
{
    Expr *expr = parse_unary(parser);
    while (parser_match(parser, TOK_STAR) || parser_match(parser, TOK_SLASH) || parser_match(parser, TOK_PERCENT))
    {
        Expr *binary = expr_new(EXPR_BINARY);
        binary->token = parser->previous;
        binary->as.binary.op = parser->previous.kind;
        binary->as.binary.left = expr;
        binary->as.binary.right = parse_unary(parser);
        expr = binary;
    }
    return expr;
}

static Expr *parse_term(Parser *parser)
{
    Expr *expr = parse_factor(parser);
    while (parser_match(parser, TOK_PLUS) || parser_match(parser, TOK_MINUS))
    {
        Expr *binary = expr_new(EXPR_BINARY);
        binary->token = parser->previous;
        binary->as.binary.op = parser->previous.kind;
        binary->as.binary.left = expr;
        binary->as.binary.right = parse_factor(parser);
        expr = binary;
    }
    return expr;
}

static Expr *parse_comparison(Parser *parser)
{
    Expr *expr = parse_term(parser);
    while (parser_match(parser, TOK_EQ) || parser_match(parser, TOK_NE) ||
           parser_match(parser, TOK_LT) || parser_match(parser, TOK_GT) ||
           parser_match(parser, TOK_LE) || parser_match(parser, TOK_GE))
    {
        Expr *binary = expr_new(EXPR_BINARY);
        binary->token = parser->previous;
        binary->as.binary.op = parser->previous.kind;
        binary->as.binary.left = expr;
        binary->as.binary.right = parse_term(parser);
        expr = binary;
    }
    return expr;
}

static Expr *parse_logical_and(Parser *parser)
{
    Expr *expr = parse_comparison(parser);
    while (parser_match(parser, TOK_AND))
    {
        Expr *binary = expr_new(EXPR_BINARY);
        binary->token = parser->previous;
        binary->as.binary.op = parser->previous.kind;
        binary->as.binary.left = expr;
        binary->as.binary.right = parse_comparison(parser);
        expr = binary;
    }
    return expr;
}

static Expr *parse_logical_or(Parser *parser)
{
    Expr *expr = parse_logical_and(parser);
    while (parser_match(parser, TOK_OR))
    {
        Expr *binary = expr_new(EXPR_BINARY);
        binary->token = parser->previous;
        binary->as.binary.op = parser->previous.kind;
        binary->as.binary.left = expr;
        binary->as.binary.right = parse_logical_and(parser);
        expr = binary;
    }
    return expr;
}

static Expr *parse_expression(Parser *parser)
{
    return parse_logical_or(parser);
}

static Stmt *stmt_new(StmtKind kind)
{
    Stmt *stmt = calloc(1, sizeof(Stmt));
    stmt->kind = kind;
    return stmt;
}

static Stmt **parse_block(Parser *parser, size_t *out_count);

static Stmt *parse_statement(Parser *parser)
{
    if (parser_match(parser, TOK_RETURN))
    {
        Stmt *stmt = stmt_new(STMT_RETURN);
        if (!parser_check(parser, TOK_SEMICOLON))
        {
            stmt->as.expr = parse_expression(parser);
        }
        parser_consume(parser, TOK_SEMICOLON, "Expected ';' after return");
        return stmt;
    }

    if (parser_match(parser, TOK_LET))
    {
        Stmt *stmt = stmt_new(STMT_LET);
        Token name = parser_consume(parser, TOK_IDENT, "Expected variable name");
        stmt->as.let_stmt.name = token_to_string(name);

        parser_consume(parser, TOK_COLON, "Expected ':' after variable name");
        stmt->as.let_stmt.type = parse_type(parser);
        parser_consume(parser, TOK_ASSIGN, "Expected '=' after variable type");
        stmt->as.let_stmt.value = parse_expression(parser);
        parser_consume(parser, TOK_SEMICOLON, "Expected ';' after variable declaration");
        return stmt;
    }

    if (parser_match(parser, TOK_IF))
    {
        Stmt *stmt = stmt_new(STMT_IF);
        parser_consume(parser, TOK_LPAREN, "Expected '(' after 'if'");
        stmt->as.if_stmt.condition = parse_expression(parser);
        parser_consume(parser, TOK_RPAREN, "Expected ')' after condition");
        parser_consume(parser, TOK_LBRACE, "Expected '{' after if condition");
        stmt->as.if_stmt.then_branch = parse_block(parser, &stmt->as.if_stmt.then_count);

        if (parser_match(parser, TOK_ELSE))
        {
            if (parser_check(parser, TOK_IF))
            {
                // else if: parse as a single-statement else branch containing an if
                Stmt *else_if = parse_statement(parser);
                stmt->as.if_stmt.else_branch = malloc(sizeof(Stmt *));
                stmt->as.if_stmt.else_branch[0] = else_if;
                stmt->as.if_stmt.else_count = 1;
            }
            else
            {
                parser_consume(parser, TOK_LBRACE, "Expected '{' after 'else'");
                stmt->as.if_stmt.else_branch = parse_block(parser, &stmt->as.if_stmt.else_count);
            }
        }
        else
        {
            stmt->as.if_stmt.else_branch = NULL;
            stmt->as.if_stmt.else_count = 0;
        }
        return stmt;
    }

    if (parser_match(parser, TOK_WHILE))
    {
        Stmt *stmt = stmt_new(STMT_WHILE);
        parser_consume(parser, TOK_LPAREN, "Expected '(' after 'while'");
        stmt->as.while_stmt.condition = parse_expression(parser);
        parser_consume(parser, TOK_RPAREN, "Expected ')' after condition");
        parser_consume(parser, TOK_LBRACE, "Expected '{' after while condition");
        stmt->as.while_stmt.body = parse_block(parser, &stmt->as.while_stmt.body_count);
        return stmt;
    }

    if (parser_match(parser, TOK_LOOP))
    {
        Stmt *stmt = stmt_new(STMT_LOOP);
        parser_consume(parser, TOK_LBRACE, "Expected '{' after 'loop'");
        stmt->as.loop_stmt.body = parse_block(parser, &stmt->as.loop_stmt.body_count);
        return stmt;
    }

    if (parser_match(parser, TOK_FOR))
    {
        Stmt *stmt = stmt_new(STMT_FOR);
        parser_consume(parser, TOK_LPAREN, "Expected '(' after 'for'");
        Token var = parser_consume(parser, TOK_IDENT, "Expected loop variable");
        stmt->as.for_stmt.var_name = token_to_string(var);
        parser_consume(parser, TOK_IN, "Expected 'in' after loop variable");
        stmt->as.for_stmt.start = parse_expression(parser);
        parser_consume(parser, TOK_RANGE, "Expected '..' in range");
        stmt->as.for_stmt.end = parse_expression(parser);
        parser_consume(parser, TOK_RPAREN, "Expected ')' after range");
        parser_consume(parser, TOK_LBRACE, "Expected '{' after for header");
        stmt->as.for_stmt.body = parse_block(parser, &stmt->as.for_stmt.body_count);
        return stmt;
    }

    if (parser_match(parser, TOK_BREAK))
    {
        Stmt *stmt = stmt_new(STMT_BREAK);
        parser_consume(parser, TOK_SEMICOLON, "Expected ';' after break");
        return stmt;
    }

    if (parser_match(parser, TOK_CONTINUE))
    {
        Stmt *stmt = stmt_new(STMT_CONTINUE);
        parser_consume(parser, TOK_SEMICOLON, "Expected ';' after continue");
        return stmt;
    }

    // Check for assignment: IDENT = expr; or IDENT += expr; etc.
    if (parser_check(parser, TOK_IDENT))
    {
        Token ident = parser->current;
        parser_advance(parser);

        // Check for compound assignment
        TokenKind compound_op = TOK_EOF;
        if (parser_match(parser, TOK_PLUSEQ))
            compound_op = TOK_PLUS;
        else if (parser_match(parser, TOK_MINUSEQ))
            compound_op = TOK_MINUS;
        else if (parser_match(parser, TOK_STAREQ))
            compound_op = TOK_STAR;
        else if (parser_match(parser, TOK_SLASHEQ))
            compound_op = TOK_SLASH;
        else if (parser_match(parser, TOK_PERCENTEQ))
            compound_op = TOK_PERCENT;
        else if (parser_match(parser, TOK_ASSIGN))
            compound_op = TOK_ASSIGN;

        if (compound_op != TOK_EOF)
        {
            Stmt *stmt = stmt_new(STMT_ASSIGN);
            stmt->as.assign_stmt.name = token_to_string(ident);

            if (compound_op == TOK_ASSIGN)
            {
                // Simple assignment
                stmt->as.assign_stmt.value = parse_expression(parser);
            }
            else
            {
                // Compound assignment: desugar to a = a op b
                Expr *var_expr = expr_new(EXPR_IDENT);
                var_expr->as.ident = token_to_string(ident);

                Expr *rhs = parse_expression(parser);

                Expr *binary = expr_new(EXPR_BINARY);
                binary->as.binary.op = compound_op;
                binary->as.binary.left = var_expr;
                binary->as.binary.right = rhs;

                stmt->as.assign_stmt.value = binary;
            }

            parser_consume(parser, TOK_SEMICOLON, "Expected ';' after assignment");
            return stmt;
        }
        // Not an assignment, backtrack and parse as expression
        parser->current = ident;
    }

    Stmt *stmt = stmt_new(STMT_EXPR);
    stmt->as.expr = parse_expression(parser);
    parser_consume(parser, TOK_SEMICOLON, "Expected ';' after expression");
    return stmt;
}

static Stmt **parse_block(Parser *parser, size_t *out_count)
{
    PtrVec stmts;
    ptrvec_init(&stmts);

    while (!parser_check(parser, TOK_RBRACE) && !parser_check(parser, TOK_EOF))
    {
        Stmt *stmt = parse_statement(parser);
        ptrvec_push(&stmts, stmt);
    }

    parser_consume(parser, TOK_RBRACE, "Expected '}' after block");
    *out_count = stmts.count;
    return (Stmt **)stmts.items;
}

static FunctionDecl *parse_function(Parser *parser, bool is_extern)
{
    parser_consume(parser, TOK_FN, "Expected 'fn'");
    Token name = parser_consume(parser, TOK_IDENT, "Expected function name");

    FunctionDecl *fn = calloc(1, sizeof(FunctionDecl));
    fn->name = token_to_string(name);
    fn->is_extern = is_extern;

    parser_consume(parser, TOK_LPAREN, "Expected '(' after function name");

    PtrVec params;
    ptrvec_init(&params);

    if (!parser_check(parser, TOK_RPAREN))
    {
        do
        {
            Param *param = calloc(1, sizeof(Param));
            Token param_name = parser_consume(parser, TOK_IDENT, "Expected parameter name");
            param->name = token_to_string(param_name);
            parser_consume(parser, TOK_COLON, "Expected ':' after parameter name");
            param->type = parse_type(parser);
            ptrvec_push(&params, param);
        } while (parser_match(parser, TOK_COMMA));
    }
    parser_consume(parser, TOK_RPAREN, "Expected ')' after parameters");

    parser_consume(parser, TOK_COLON, "Expected ':' before return type");
    fn->return_type = parse_type(parser);

    if (is_extern)
    {
        // Extern functions have no body, just a semicolon
        parser_consume(parser, TOK_SEMICOLON, "Expected ';' after extern function declaration");
        fn->body = NULL;
        fn->body_count = 0;
    }
    else
    {
        parser_consume(parser, TOK_ARROW, "Expected '=>' after return type");

        if (parser_match(parser, TOK_LBRACE))
        {
            fn->body = parse_block(parser, &fn->body_count);
        }
        else
        {
            Stmt *stmt = stmt_new(STMT_RETURN);
            stmt->as.expr = parse_expression(parser);
            parser_match(parser, TOK_SEMICOLON);
            fn->body = malloc(sizeof(Stmt *));
            fn->body[0] = stmt;
            fn->body_count = 1;
        }
    }

    fn->params = malloc(params.count * sizeof(Param));
    fn->param_count = params.count;
    for (size_t i = 0; i < params.count; i++)
    {
        fn->params[i] = *(Param *)params.items[i];
    }

    return fn;
}

static StructDecl *parse_struct(Parser *parser)
{
    parser_consume(parser, TOK_STRUCT, "Expected 'struct'");
    Token name = parser_consume(parser, TOK_IDENT, "Expected struct name");

    StructDecl *decl = calloc(1, sizeof(StructDecl));
    decl->name = token_to_string(name);

    parser_consume(parser, TOK_LBRACE, "Expected '{' after struct name");

    PtrVec fields;
    ptrvec_init(&fields);

    while (!parser_check(parser, TOK_RBRACE) && !parser_check(parser, TOK_EOF))
    {
        Field *field = calloc(1, sizeof(Field));
        Token field_name = parser_consume(parser, TOK_IDENT, "Expected field name");
        field->name = token_to_string(field_name);
        parser_consume(parser, TOK_COLON, "Expected ':' after field name");
        field->type = parse_type(parser);
        ptrvec_push(&fields, field);

        if (!parser_check(parser, TOK_RBRACE))
        {
            parser_consume(parser, TOK_COMMA, "Expected ',' after field");
        }
    }

    parser_consume(parser, TOK_RBRACE, "Expected '}' after struct fields");

    decl->fields = malloc(fields.count * sizeof(Field));
    decl->field_count = fields.count;
    for (size_t i = 0; i < fields.count; i++)
    {
        decl->fields[i] = *(Field *)fields.items[i];
    }

    return decl;
}

static Program *parse_program(Parser *parser)
{
    PtrVec structs;
    ptrvec_init(&structs);
    PtrVec funcs;
    ptrvec_init(&funcs);

    while (!parser_check(parser, TOK_EOF))
    {
        if (parser_check(parser, TOK_STRUCT))
        {
            StructDecl *structdecl = parse_struct(parser);
            ptrvec_push(&structs, structdecl);
        }
        else if (parser_check(parser, TOK_EXTERN))
        {
            parser_advance(parser); // consume 'extern'
            FunctionDecl *fn = parse_function(parser, true);
            ptrvec_push(&funcs, fn);
        }
        else if (parser_check(parser, TOK_FN))
        {
            FunctionDecl *fn = parse_function(parser, false);
            ptrvec_push(&funcs, fn);
        }
        else
        {
            parser_error_at(parser, parser->current, "Only struct and function declarations are supported at top-level");
            parser_advance(parser);
        }
    }

    Program *program = calloc(1, sizeof(Program));
    program->structs = (StructDecl **)structs.items;
    program->struct_count = structs.count;
    program->functions = (FunctionDecl **)funcs.items;
    program->function_count = funcs.count;
    return program;
}

// ============================================================================
// TYPE CHECKER
// ============================================================================

typedef struct
{
    String name;
    Type type;
} Symbol;

typedef struct
{
    Symbol *symbols;
    size_t count;
    size_t capacity;
} SymbolTable;

static void symtab_init(SymbolTable *table)
{
    table->symbols = NULL;
    table->count = 0;
    table->capacity = 0;
}

static void symtab_add(SymbolTable *table, String name, Type type)
{
    if (table->count + 1 > table->capacity)
    {
        table->capacity = table->capacity == 0 ? 8 : table->capacity * 2;
        table->symbols = realloc(table->symbols, table->capacity * sizeof(Symbol));
    }
    table->symbols[table->count++] = (Symbol){name, type};
}

static bool string_equals(String a, const char *b)
{
    size_t len = strlen(b);
    return a.length == len && memcmp(a.data, b, len) == 0;
}

static bool symbol_lookup(SymbolTable *table, String name, Type *out_type)
{
    for (size_t i = 0; i < table->count; i++)
    {
        if (table->symbols[i].name.length == name.length &&
            memcmp(table->symbols[i].name.data, name.data, name.length) == 0)
        {
            *out_type = table->symbols[i].type;
            return true;
        }
    }
    return false;
}

static const char *type_name(Type type)
{
    switch (type.kind)
    {
    case TYPE_VOID:
        return "Void";
    case TYPE_I32:
        return "I32";
    case TYPE_BOOL:
        return "Bool";
    case TYPE_STRPTR:
        return "*Str";
    case TYPE_STRUCT:
        return type.data.struct_name.data;
    case TYPE_ARRAY:
        // Simplified: just return "Array" for now
        return "Array";
    case TYPE_POINTER:
        // Simplified: just return "*T" for now
        return "*T";
    }
    return "<unknown>";
}

static Type typecheck_expr(SymbolTable *table, Expr *expr);
static bool type_equals(Type a, Type b);

static Type typecheck_call(SymbolTable *table, Expr *expr)
{
    if (string_equals(expr->as.call.name, "printf"))
    {
        if (expr->as.call.arg_count == 0)
        {
            fprintf(stderr, "Type error: printf requires at least one argument\n");
            return (Type){TYPE_I32};
        }
        Type first = typecheck_expr(table, expr->as.call.args[0]);
        if (first.kind != TYPE_STRPTR)
        {
            fprintf(stderr, "Type error: printf first argument must be *Str\n");
        }
        for (size_t i = 1; i < expr->as.call.arg_count; i++)
        {
            typecheck_expr(table, expr->as.call.args[i]);
        }
        return (Type){TYPE_I32};
    }

    Type fn_type;
    if (symbol_lookup(table, expr->as.call.name, &fn_type))
    {
        return fn_type;
    }

    fprintf(stderr, "Type error: unknown function '%s'\n", expr->as.call.name.data);
    return (Type){TYPE_I32};
}

static Type typecheck_expr(SymbolTable *table, Expr *expr)
{
    switch (expr->kind)
    {
    case EXPR_NUMBER:
        return (Type){TYPE_I32};
    case EXPR_STRING:
        return (Type){TYPE_STRPTR};
    case EXPR_BOOL:
        return (Type){TYPE_BOOL};
    case EXPR_NULL:
    {
        // null can be any pointer type - return a generic void pointer
        Type ptr_type;
        ptr_type.kind = TYPE_POINTER;
        ptr_type.data.pointer_to = malloc(sizeof(Type));
        ptr_type.data.pointer_to->kind = TYPE_VOID;
        return ptr_type;
    }
    case EXPR_IDENT:
    {
        Type type;
        if (!symbol_lookup(table, expr->as.ident, &type))
        {
            fprintf(stderr, "Type error: unknown identifier '%s'\n", expr->as.ident.data);
            return (Type){TYPE_I32};
        }
        return type;
    }
    case EXPR_CALL:
        return typecheck_call(table, expr);
    case EXPR_UNARY:
    {
        Type operand = typecheck_expr(table, expr->as.unary.value);
        if (expr->as.unary.op == TOK_NOT)
        {
            if (operand.kind != TYPE_BOOL)
            {
                fprintf(stderr, "Type error: '!' expects Bool but got %s\n", type_name(operand));
            }
            return (Type){TYPE_BOOL};
        }
        if (expr->as.unary.op == TOK_MINUS)
        {
            if (operand.kind != TYPE_I32)
            {
                fprintf(stderr, "Type error: unary '-' expects I32 but got %s\n", type_name(operand));
            }
            return (Type){TYPE_I32};
        }
        return operand;
    }
    case EXPR_BINARY:
    {
        Type left = typecheck_expr(table, expr->as.binary.left);
        Type right = typecheck_expr(table, expr->as.binary.right);

        switch (expr->as.binary.op)
        {
        case TOK_PLUS:
        case TOK_MINUS:
        case TOK_STAR:
        case TOK_SLASH:
        case TOK_PERCENT:
            if (left.kind != TYPE_I32 || right.kind != TYPE_I32)
            {
                fprintf(stderr, "Type error: arithmetic expects I32 operands\n");
            }
            return (Type){TYPE_I32};
        case TOK_EQ:
        case TOK_NE:
        case TOK_LT:
        case TOK_GT:
        case TOK_LE:
        case TOK_GE:
            if (left.kind != right.kind)
            {
                fprintf(stderr, "Type error: comparison expects matching operand types\n");
            }
            return (Type){TYPE_BOOL};
        case TOK_AND:
        case TOK_OR:
            if (left.kind != TYPE_BOOL || right.kind != TYPE_BOOL)
            {
                fprintf(stderr, "Type error: logical operators expect Bool operands\n");
            }
            return (Type){TYPE_BOOL};
        default:
            return left;
        }
    }
    case EXPR_MEMBER_ACCESS:
    {
        Type object_type = typecheck_expr(table, expr->as.member_access.object);
        // Simplified: for now, just return I32.
        // Proper implementation would look up the struct definition and field type
        (void)object_type; // suppress unused warning
        return (Type){TYPE_I32};
    }
    case EXPR_STRUCT_LITERAL:
    {
        Type t;
        t.kind = TYPE_STRUCT;
        t.data.struct_name = expr->as.struct_literal.type_name;
        // Typecheck field values
        for (size_t i = 0; i < expr->as.struct_literal.field_count; i++)
        {
            typecheck_expr(table, expr->as.struct_literal.field_values[i]);
        }
        return t;
    }
    case EXPR_ARRAY_LITERAL:
    {
        if (expr->as.array_literal.element_count == 0)
        {
            fprintf(stderr, "Type error: cannot infer type of empty array literal\n");
            Type error_type;
            error_type.kind = TYPE_VOID;
            return error_type;
        }
        Type elem_type = typecheck_expr(table, expr->as.array_literal.elements[0]);
        for (size_t i = 1; i < expr->as.array_literal.element_count; i++)
        {
            Type t = typecheck_expr(table, expr->as.array_literal.elements[i]);
            if (!type_equals(t, elem_type))
            {
                fprintf(stderr, "Type error: array literal elements must have same type\n");
            }
        }
        Type array_type;
        array_type.kind = TYPE_ARRAY;
        array_type.data.array_info.element_type = malloc(sizeof(Type));
        *array_type.data.array_info.element_type = elem_type;
        array_type.data.array_info.array_size = (int)expr->as.array_literal.element_count;
        return array_type;
    }
    case EXPR_INDEX:
    {
        Type array_type = typecheck_expr(table, expr->as.index.array);
        Type index_type = typecheck_expr(table, expr->as.index.index);
        if (index_type.kind != TYPE_I32)
        {
            fprintf(stderr, "Type error: array index must be I32\n");
        }
        if (array_type.kind != TYPE_ARRAY)
        {
            fprintf(stderr, "Type error: cannot index non-array type\n");
            Type error_type;
            error_type.kind = TYPE_VOID;
            return error_type;
        }
        return *array_type.data.array_info.element_type;
    }
    case EXPR_ADDRESS_OF:
    {
        Type operand = typecheck_expr(table, expr->as.unary.value);
        Type ptr_type;
        ptr_type.kind = TYPE_POINTER;
        ptr_type.data.pointer_to = malloc(sizeof(Type));
        *ptr_type.data.pointer_to = operand;
        return ptr_type;
    }
    case EXPR_DEREF:
    {
        Type operand = typecheck_expr(table, expr->as.unary.value);
        if (operand.kind != TYPE_POINTER)
        {
            fprintf(stderr, "Type error: cannot dereference non-pointer type\n");
            Type error_type;
            error_type.kind = TYPE_VOID;
            return error_type;
        }
        return *operand.data.pointer_to;
    }
    case EXPR_CAST:
    {
        // For casts, we don't validate the conversion - in a self-hosted compiler,
        // casts are an escape valve for FFI and unsafe operations that bypass type safety
        typecheck_expr(table, expr->as.cast.expr);
        return expr->as.cast.target_type;
    }
    }
    return (Type){TYPE_VOID};
}

static bool type_equals(Type a, Type b)
{
    if (a.kind != b.kind)
        return false;
    if (a.kind == TYPE_STRUCT)
    {
        return strcmp(a.data.struct_name.data, b.data.struct_name.data) == 0;
    }
    if (a.kind == TYPE_ARRAY)
    {
        if (a.data.array_info.array_size != b.data.array_info.array_size)
            return false;
        return type_equals(*a.data.array_info.element_type, *b.data.array_info.element_type);
    }
    if (a.kind == TYPE_POINTER)
    {
        return type_equals(*a.data.pointer_to, *b.data.pointer_to);
    }
    return true;
}

static bool typecheck_function(Program *program, FunctionDecl *fn)
{
    // Extern functions have no body to typecheck
    if (fn->is_extern)
    {
        return true;
    }

    SymbolTable table;
    symtab_init(&table);

    for (size_t i = 0; i < program->function_count; i++)
    {
        symtab_add(&table, program->functions[i]->name, program->functions[i]->return_type);
    }

    for (size_t i = 0; i < fn->param_count; i++)
    {
        symtab_add(&table, fn->params[i].name, fn->params[i].type);
    }

    bool ok = true;
    for (size_t i = 0; i < fn->body_count; i++)
    {
        Stmt *stmt = fn->body[i];
        switch (stmt->kind)
        {
        case STMT_RETURN:
        {
            Type ret = (Type){TYPE_VOID};
            if (stmt->as.expr)
                ret = typecheck_expr(&table, stmt->as.expr);
            if (!type_equals(ret, fn->return_type))
            {
                fprintf(stderr, "Type error: return type mismatch in function '%s' (expected %s, got %s)\n",
                        fn->name.data, type_name(fn->return_type), type_name(ret));
                ok = false;
            }
            break;
        }
        case STMT_LET:
        {
            Type init_type = typecheck_expr(&table, stmt->as.let_stmt.value);
            if (!type_equals(init_type, stmt->as.let_stmt.type))
            {
                fprintf(stderr, "Type error: cannot assign %s to %s in let '%s'\n",
                        type_name(init_type), type_name(stmt->as.let_stmt.type), stmt->as.let_stmt.name.data);
                ok = false;
            }
            symtab_add(&table, stmt->as.let_stmt.name, stmt->as.let_stmt.type);
            break;
        }
        case STMT_ASSIGN:
        {
            Type var_type;
            if (!symbol_lookup(&table, stmt->as.assign_stmt.name, &var_type))
            {
                fprintf(stderr, "Type error: undefined variable '%s' in assignment\n",
                        stmt->as.assign_stmt.name.data);
                ok = false;
            }
            Type value_type = typecheck_expr(&table, stmt->as.assign_stmt.value);
            if (!type_equals(value_type, var_type))
            {
                fprintf(stderr, "Type error: cannot assign %s to %s in variable '%s'\n",
                        type_name(value_type), type_name(var_type), stmt->as.assign_stmt.name.data);
                ok = false;
            }
            break;
        }
        case STMT_EXPR:
            typecheck_expr(&table, stmt->as.expr);
            break;
        case STMT_IF:
        {
            Type cond_type = typecheck_expr(&table, stmt->as.if_stmt.condition);
            if (cond_type.kind != TYPE_BOOL && cond_type.kind != TYPE_I32)
            {
                fprintf(stderr, "Type error: if condition must be Bool or I32, got %s\n",
                        type_name(cond_type));
                ok = false;
            }
            // Note: We're not creating a new scope for the branches in this simple implementation
            break;
        }
        case STMT_WHILE:
        {
            Type cond_type = typecheck_expr(&table, stmt->as.while_stmt.condition);
            if (cond_type.kind != TYPE_BOOL && cond_type.kind != TYPE_I32)
            {
                fprintf(stderr, "Type error: while condition must be Bool or I32, got %s\n",
                        type_name(cond_type));
                ok = false;
            }
            // Note: We're not creating a new scope for the body in this simple implementation
            break;
        }
        case STMT_LOOP:
            // Infinite loop - no condition to check
            // Note: We're not creating a new scope for the body in this simple implementation
            break;
        case STMT_FOR:
        {
            Type start_type = typecheck_expr(&table, stmt->as.for_stmt.start);
            Type end_type = typecheck_expr(&table, stmt->as.for_stmt.end);
            if (start_type.kind != TYPE_I32)
            {
                fprintf(stderr, "Type error: for loop start must be I32, got %s\n",
                        type_name(start_type));
                ok = false;
            }
            if (end_type.kind != TYPE_I32)
            {
                fprintf(stderr, "Type error: for loop end must be I32, got %s\n",
                        type_name(end_type));
                ok = false;
            }
            // Add loop variable to symbol table (simple implementation - no scope)
            symtab_add(&table, stmt->as.for_stmt.var_name, (Type){TYPE_I32});
            break;
        }
        case STMT_BREAK:
        case STMT_CONTINUE:
            // Note: We're not validating loop context in this simple implementation
            break;
        }
    }
    return ok;
}

static bool typecheck_program(Program *program)
{
    bool ok = true;
    for (size_t i = 0; i < program->function_count; i++)
    {
        if (!typecheck_function(program, program->functions[i]))
        {
            ok = false;
        }
    }
    return ok;
}

// ============================================================================
// CODE GENERATOR
// ============================================================================

static void emit_type(String *out, Type type)
{
    switch (type.kind)
    {
    case TYPE_VOID:
        string_append_cstr(out, "void");
        break;
    case TYPE_I32:
        string_append_cstr(out, "int32_t");
        break;
    case TYPE_BOOL:
        string_append_cstr(out, "bool");
        break;
    case TYPE_STRPTR:
        string_append_cstr(out, "const char*");
        break;
    case TYPE_STRUCT:
        string_append_cstr(out, "struct ");
        string_append_cstr(out, type.data.struct_name.data);
        break;
    case TYPE_ARRAY:
        // For arrays, emit the element type (size will be added separately)
        emit_type(out, *type.data.array_info.element_type);
        break;
    case TYPE_POINTER:
        emit_type(out, *type.data.pointer_to);
        string_append_cstr(out, "*");
        break;
    }
}

static void emit_expr(String *out, Expr *expr)
{
    switch (expr->kind)
    {
    case EXPR_NUMBER:
        string_append_cstr(out, "");
        string_append_range(out, expr->token.start, expr->token.length);
        break;
    case EXPR_STRING:
        string_append_range(out, expr->token.start, expr->token.length);
        break;
    case EXPR_BOOL:
        string_append_cstr(out, expr->as.bool_value ? "true" : "false");
        break;
    case EXPR_NULL:
        string_append_cstr(out, "NULL");
        break;
    case EXPR_IDENT:
        string_append_cstr(out, expr->as.ident.data);
        break;
    case EXPR_CALL:
        string_append_cstr(out, expr->as.call.name.data);
        string_append_cstr(out, "(");
        for (size_t i = 0; i < expr->as.call.arg_count; i++)
        {
            if (i > 0)
                string_append_cstr(out, ", ");
            emit_expr(out, expr->as.call.args[i]);
        }
        string_append_cstr(out, ")");
        break;
    case EXPR_UNARY:
        if (expr->as.unary.op == TOK_NOT)
            string_append_cstr(out, "!");
        else if (expr->as.unary.op == TOK_MINUS)
            string_append_cstr(out, "-");
        emit_expr(out, expr->as.unary.value);
        break;
    case EXPR_BINARY:
        string_append_cstr(out, "(");
        emit_expr(out, expr->as.binary.left);
        switch (expr->as.binary.op)
        {
        case TOK_PLUS:
            string_append_cstr(out, " + ");
            break;
        case TOK_MINUS:
            string_append_cstr(out, " - ");
            break;
        case TOK_STAR:
            string_append_cstr(out, " * ");
            break;
        case TOK_SLASH:
            string_append_cstr(out, " / ");
            break;
        case TOK_PERCENT:
            string_append_cstr(out, " % ");
            break;
        case TOK_EQ:
            string_append_cstr(out, " == ");
            break;
        case TOK_NE:
            string_append_cstr(out, " != ");
            break;
        case TOK_LT:
            string_append_cstr(out, " < ");
            break;
        case TOK_GT:
            string_append_cstr(out, " > ");
            break;
        case TOK_LE:
            string_append_cstr(out, " <= ");
            break;
        case TOK_GE:
            string_append_cstr(out, " >= ");
            break;
        case TOK_AND:
            string_append_cstr(out, " && ");
            break;
        case TOK_OR:
            string_append_cstr(out, " || ");
            break;
        default:
            string_append_cstr(out, " ? ");
            break;
        }
        emit_expr(out, expr->as.binary.right);
        string_append_cstr(out, ")");
        break;
    case EXPR_MEMBER_ACCESS:
        emit_expr(out, expr->as.member_access.object);
        string_append_cstr(out, ".");
        string_append_cstr(out, expr->as.member_access.member_name.data);
        break;
    case EXPR_STRUCT_LITERAL:
        string_append_cstr(out, "(struct ");
        string_append_cstr(out, expr->as.struct_literal.type_name.data);
        string_append_cstr(out, "){");
        for (size_t i = 0; i < expr->as.struct_literal.field_count; i++)
        {
            if (i > 0)
                string_append_cstr(out, ", ");
            string_append_cstr(out, ".");
            string_append_cstr(out, expr->as.struct_literal.field_names[i].data);
            string_append_cstr(out, " = ");
            emit_expr(out, expr->as.struct_literal.field_values[i]);
        }
        string_append_cstr(out, "}");
        break;
    case EXPR_ARRAY_LITERAL:
        string_append_cstr(out, "{");
        for (size_t i = 0; i < expr->as.array_literal.element_count; i++)
        {
            if (i > 0)
                string_append_cstr(out, ", ");
            emit_expr(out, expr->as.array_literal.elements[i]);
        }
        string_append_cstr(out, "}");
        break;
    case EXPR_INDEX:
        emit_expr(out, expr->as.index.array);
        string_append_cstr(out, "[");
        emit_expr(out, expr->as.index.index);
        string_append_cstr(out, "]");
        break;
    case EXPR_ADDRESS_OF:
        string_append_cstr(out, "&");
        emit_expr(out, expr->as.unary.value);
        break;
    case EXPR_DEREF:
        string_append_cstr(out, "*");
        emit_expr(out, expr->as.unary.value);
        break;
    case EXPR_CAST:
        string_append_cstr(out, "(");
        emit_type(out, expr->as.cast.target_type);
        string_append_cstr(out, ")");
        emit_expr(out, expr->as.cast.expr);
        break;
    }
}

static void emit_stmt(String *out, Stmt *stmt)
{
    switch (stmt->kind)
    {
    case STMT_EXPR:
        emit_expr(out, stmt->as.expr);
        string_append_cstr(out, ";\n");
        break;
    case STMT_RETURN:
        string_append_cstr(out, "return");
        if (stmt->as.expr)
        {
            string_append_cstr(out, " ");
            emit_expr(out, stmt->as.expr);
        }
        string_append_cstr(out, ";\n");
        break;
    case STMT_LET:
        if (stmt->as.let_stmt.type.kind == TYPE_ARRAY)
        {
            // Special handling for array declarations: type name[size] = {...}
            emit_type(out, *stmt->as.let_stmt.type.data.array_info.element_type);
            string_append_cstr(out, " ");
            string_append_cstr(out, stmt->as.let_stmt.name.data);
            string_append_cstr(out, "[");
            char size_buf[32];
            snprintf(size_buf, sizeof(size_buf), "%d", stmt->as.let_stmt.type.data.array_info.array_size);
            string_append_cstr(out, size_buf);
            string_append_cstr(out, "]");
        }
        else
        {
            emit_type(out, stmt->as.let_stmt.type);
            string_append_cstr(out, " ");
            string_append_cstr(out, stmt->as.let_stmt.name.data);
        }
        string_append_cstr(out, " = ");
        emit_expr(out, stmt->as.let_stmt.value);
        string_append_cstr(out, ";\n");
        break;
    case STMT_ASSIGN:
        string_append_cstr(out, stmt->as.assign_stmt.name.data);
        string_append_cstr(out, " = ");
        emit_expr(out, stmt->as.assign_stmt.value);
        string_append_cstr(out, ";\n");
        break;
    case STMT_IF:
        string_append_cstr(out, "if (");
        emit_expr(out, stmt->as.if_stmt.condition);
        string_append_cstr(out, ") {\n");
        for (size_t i = 0; i < stmt->as.if_stmt.then_count; i++)
        {
            string_append_cstr(out, "        ");
            emit_stmt(out, stmt->as.if_stmt.then_branch[i]);
        }
        string_append_cstr(out, "    }");
        if (stmt->as.if_stmt.else_branch)
        {
            string_append_cstr(out, " else {\n");
            for (size_t i = 0; i < stmt->as.if_stmt.else_count; i++)
            {
                string_append_cstr(out, "        ");
                emit_stmt(out, stmt->as.if_stmt.else_branch[i]);
            }
            string_append_cstr(out, "    }");
        }
        string_append_cstr(out, "\n");
        break;
    case STMT_WHILE:
        string_append_cstr(out, "while (");
        emit_expr(out, stmt->as.while_stmt.condition);
        string_append_cstr(out, ") {\n");
        for (size_t i = 0; i < stmt->as.while_stmt.body_count; i++)
        {
            string_append_cstr(out, "        ");
            emit_stmt(out, stmt->as.while_stmt.body[i]);
        }
        string_append_cstr(out, "    }\n");
        break;
    case STMT_LOOP:
        string_append_cstr(out, "while (1) {\n");
        for (size_t i = 0; i < stmt->as.loop_stmt.body_count; i++)
        {
            string_append_cstr(out, "        ");
            emit_stmt(out, stmt->as.loop_stmt.body[i]);
        }
        string_append_cstr(out, "    }\n");
        break;
    case STMT_FOR:
        string_append_cstr(out, "for (int32_t ");
        string_append_cstr(out, stmt->as.for_stmt.var_name.data);
        string_append_cstr(out, " = ");
        emit_expr(out, stmt->as.for_stmt.start);
        string_append_cstr(out, "; ");
        string_append_cstr(out, stmt->as.for_stmt.var_name.data);
        string_append_cstr(out, " < ");
        emit_expr(out, stmt->as.for_stmt.end);
        string_append_cstr(out, "; ");
        string_append_cstr(out, stmt->as.for_stmt.var_name.data);
        string_append_cstr(out, "++) {\n");
        for (size_t i = 0; i < stmt->as.for_stmt.body_count; i++)
        {
            string_append_cstr(out, "        ");
            emit_stmt(out, stmt->as.for_stmt.body[i]);
        }
        string_append_cstr(out, "    }\n");
        break;
    case STMT_BREAK:
        string_append_cstr(out, "break;\n");
        break;
    case STMT_CONTINUE:
        string_append_cstr(out, "continue;\n");
        break;
    }
}

static void emit_function_decl(String *out, FunctionDecl *fn, bool is_definition)
{
    // For extern functions, only emit declaration, never definition
    if (fn->is_extern && is_definition)
    {
        return;
    }

    bool is_main = string_equals(fn->name, "main");
    bool main_void = is_main && fn->return_type.kind == TYPE_VOID;

    // Add 'extern' keyword for extern function declarations
    if (fn->is_extern && !is_definition)
    {
        string_append_cstr(out, "extern ");
    }

    if (main_void)
    {
        string_append_cstr(out, "int");
    }
    else
    {
        emit_type(out, fn->return_type);
    }
    string_append_cstr(out, " ");
    string_append_cstr(out, fn->name.data);
    string_append_cstr(out, "(");
    for (size_t i = 0; i < fn->param_count; i++)
    {
        if (i > 0)
            string_append_cstr(out, ", ");
        emit_type(out, fn->params[i].type);
        string_append_cstr(out, " ");
        string_append_cstr(out, fn->params[i].name.data);
    }
    string_append_cstr(out, ")");

    if (!is_definition)
    {
        string_append_cstr(out, ";\n");
        return;
    }

    string_append_cstr(out, " {\n");
    for (size_t i = 0; i < fn->body_count; i++)
    {
        string_append_cstr(out, "    ");
        emit_stmt(out, fn->body[i]);
    }
    if (main_void)
    {
        bool has_return = fn->body_count > 0 && fn->body[fn->body_count - 1]->kind == STMT_RETURN;
        if (!has_return)
        {
            string_append_cstr(out, "    return 0;\n");
        }
    }
    string_append_cstr(out, "}\n\n");
}

static void emit_struct_decl(String *out, StructDecl *structdecl)
{
    string_append_cstr(out, "struct ");
    string_append_cstr(out, structdecl->name.data);
    string_append_cstr(out, " {\n");
    for (size_t i = 0; i < structdecl->field_count; i++)
    {
        string_append_cstr(out, "    ");
        emit_type(out, structdecl->fields[i].type);
        string_append_cstr(out, " ");
        string_append_cstr(out, structdecl->fields[i].name.data);
        string_append_cstr(out, ";\n");
    }
    string_append_cstr(out, "};\n\n");
}

static String codegen_c(Program *program, const char *input_file)
{
    String out = string_new();
    string_append_cstr(&out, "// Generated by tuffc from ");
    string_append_cstr(&out, input_file);
    string_append_cstr(&out, "\n\n");
    string_append_cstr(&out, "#include <stdio.h>\n");
    string_append_cstr(&out, "#include <stdint.h>\n");
    string_append_cstr(&out, "#include <stdbool.h>\n\n");

    // Emit struct declarations
    for (size_t i = 0; i < program->struct_count; i++)
    {
        emit_struct_decl(&out, program->structs[i]);
    }
    if (program->struct_count > 0)
    {
        string_append_cstr(&out, "\n");
    }

    for (size_t i = 0; i < program->function_count; i++)
    {
        emit_function_decl(&out, program->functions[i], false);
    }
    string_append_cstr(&out, "\n");

    for (size_t i = 0; i < program->function_count; i++)
    {
        emit_function_decl(&out, program->functions[i], true);
    }

    return out;
}

static String codegen_header(Program *program, const char *input_file)
{
    String out = string_new();
    string_append_cstr(&out, "// Generated by tuffc from ");
    string_append_cstr(&out, input_file);
    string_append_cstr(&out, "\n\n");
    string_append_cstr(&out, "#ifndef TUFF_HEADER_H\n");
    string_append_cstr(&out, "#define TUFF_HEADER_H\n\n");
    string_append_cstr(&out, "#include <stdint.h>\n");
    string_append_cstr(&out, "#include <stdbool.h>\n\n");

    // Emit struct declarations
    for (size_t i = 0; i < program->struct_count; i++)
    {
        emit_struct_decl(&out, program->structs[i]);
    }
    if (program->struct_count > 0)
    {
        string_append_cstr(&out, "\n");
    }

    for (size_t i = 0; i < program->function_count; i++)
    {
        emit_function_decl(&out, program->functions[i], false);
    }

    string_append_cstr(&out, "\n#endif // TUFF_HEADER_H\n");
    return out;
}

// ============================================================================
// MAIN
// ============================================================================

void print_usage(const char *program)
{
    fprintf(stderr, "Usage: %s <input.tuff> -o <output.c> [-h <output.h>]\n", program);
    fprintf(stderr, "       %s --version\n", program);
}

int main(int argc, char **argv)
{
    if (argc == 2 && strcmp(argv[1], "--version") == 0)
    {
        printf("tuffc 0.1.0 (bootstrap)\n");
        return 0;
    }

    if (argc < 4)
    {
        print_usage(argv[0]);
        return 1;
    }

    const char *input_file = argv[1];
    const char *output_c = NULL;
    const char *output_h = NULL;

    // Simple argument parsing
    for (int i = 2; i < argc; i++)
    {
        if (strcmp(argv[i], "-o") == 0 && i + 1 < argc)
        {
            output_c = argv[++i];
        }
        else if (strcmp(argv[i], "-h") == 0 && i + 1 < argc)
        {
            output_h = argv[++i];
        }
    }

    if (!output_c)
    {
        fprintf(stderr, "Error: Output file not specified\n");
        print_usage(argv[0]);
        return 1;
    }

    printf("Compiling %s -> %s", input_file, output_c);
    if (output_h)
        printf(" (header: %s)", output_h);
    printf("\n");

    // Read source file
    String source = read_file(input_file);

    // Parse
    Parser parser;
    parser_init(&parser, source.data);
    Program *program = parse_program(&parser);

    if (parser.had_error)
    {
        fprintf(stderr, "Parsing failed\n");
        string_free(&source);
        return 1;
    }

    // Type check
    if (!typecheck_program(program))
    {
        fprintf(stderr, "Type checking failed\n");
        string_free(&source);
        return 1;
    }

    // Code generation
    String output = codegen_c(program, input_file);
    write_file(output_c, output.data);
    printf("Generated %s\n", output_c);

    if (output_h)
    {
        String header = codegen_header(program, input_file);
        write_file(output_h, header.data);
        printf("Generated %s\n", output_h);
        string_free(&header);
    }

    string_free(&source);
    string_free(&output);

    printf("Compilation successful!\n");
    return 0;
}
