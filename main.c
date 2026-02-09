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

    // Operators
    TOK_PLUS,     // +
    TOK_MINUS,    // -
    TOK_STAR,     // *
    TOK_SLASH,    // /
    TOK_PERCENT,  // %
    TOK_EQ,       // ==
    TOK_NE,       // !=
    TOK_LT,       // <
    TOK_GT,       // >
    TOK_LE,       // <=
    TOK_GE,       // >=
    TOK_AND,      // &&
    TOK_OR,       // ||
    TOK_NOT,      // !
    TOK_ASSIGN,   // =
    TOK_ARROW,    // =>
    TOK_PIPE,     // |
    TOK_PIPEGT,   // |>
    TOK_RANGE,    // ..
    TOK_QUESTION, // ?

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
        return check_keyword(start, length, "type", TOK_TYPE);
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
        return make_token(lexer, TOK_PERCENT);
    case '+':
        return make_token(lexer, TOK_PLUS);
    case '-':
        return make_token(lexer, TOK_MINUS);
    case '*':
        return make_token(lexer, TOK_STAR);
    case '/':
        return make_token(lexer, TOK_SLASH);
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
        break;
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

    // Lex
    Lexer lexer = lexer_new(source.data);
    printf("Lexing...\n");

    Token token;
    do
    {
        token = lexer_next_token(&lexer);
        // For now, just verify lexing works
        if (token.kind == TOK_ERROR)
        {
            fprintf(stderr, "Lexical error\n");
            string_free(&source);
            return 1;
        }
    } while (token.kind != TOK_EOF);

    printf("Lexing complete\n");

    // TODO: Parser, type checker, code generator

    // For now, generate a minimal C file
    String output = string_new();
    string_append_cstr(&output, "// Generated by tuffc from ");
    string_append_cstr(&output, input_file);
    string_append_cstr(&output, "\n\n");
    string_append_cstr(&output, "#include <stdio.h>\n\n");
    string_append_cstr(&output, "int main(void) {\n");
    string_append_cstr(&output, "    printf(\"Hello from Tuff!\\n\");\n");
    string_append_cstr(&output, "    return 0;\n");
    string_append_cstr(&output, "}\n");

    write_file(output_c, output.data);
    printf("Generated %s\n", output_c);

    if (output_h)
    {
        String header = string_new();
        string_append_cstr(&header, "// Generated by tuffc from ");
        string_append_cstr(&header, input_file);
        string_append_cstr(&header, "\n\n");
        string_append_cstr(&header, "#ifndef TUFF_HEADER_H\n");
        string_append_cstr(&header, "#define TUFF_HEADER_H\n\n");
        string_append_cstr(&header, "// Declarations will go here\n\n");
        string_append_cstr(&header, "#endif // TUFF_HEADER_H\n");

        write_file(output_h, header.data);
        printf("Generated %s\n", output_h);
        string_free(&header);
    }

    string_free(&source);
    string_free(&output);

    printf("Compilation successful!\n");
    return 0;
}
