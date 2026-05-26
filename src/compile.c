#define _CRT_SECURE_NO_WARNINGS

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "compile.h"

static CompileError compile_error = NoError;

void clear_compile_error(void)
{
    compile_error = NoError;
}

bool has_compile_error(void)
{
    return compile_error != NoError;
}

CompileError get_compile_error(void)
{
    return compile_error;
}

const char *compile_tuff_to_c(const char *input)
{
    clear_compile_error();

    /* Parse read<U{N}>() pattern generically */
    /* Parse read<U{N}>() pattern generically */
    {
        const char *prefix = "read<U";
        const char *suffix = ">()";
        size_t plen = strlen(prefix);
        size_t slen = strlen(suffix);
        size_t ilen = strlen(input);

        if (ilen > plen + slen &&
            strncmp(input, prefix, plen) == 0 &&
            strcmp(input + ilen - slen, suffix) == 0)
        {
            /* Extract the bit-count string between prefix and suffix */
            char bits_str[16];
            size_t bits_len = ilen - plen - slen;
            if (bits_len > 0 && bits_len < sizeof(bits_str))
            {
                strncpy(bits_str, input + plen, bits_len);
                bits_str[bits_len] = '\0';

                int bits = atoi(bits_str);

                /* Map bit width to C type and scanf format string */
                const char *c_type = NULL;
                const char *scanf_fmt = NULL;

                if (bits == 8)
                {
                    c_type = "unsigned char";
                    scanf_fmt = "%hhu";
                }
                else if (bits == 16)
                {
                    c_type = "unsigned short";
                    scanf_fmt = "%hu";
                }
                else
                {
                    compile_error = UnsupportedBitWidth;
                    return NULL;
                }

                /* Build the generated C code */
                const char *code_prefix =
                    "#include <stdio.h>\n"
                    "int main(void)\n"
                    "{\n"
                    "    ";
                const char *code_mid_type = c_type;
                const char *code_mid_read =
                    " val;\n"
                    "    if (scanf(\"";
                const char *code_mid_fmt = scanf_fmt;
                const char *code_suffix =
                    "\", &val) != 1)\n"
                    "        return 1;\n"
                    "    return val;\n"
                    "}\n";

                size_t len = strlen(code_prefix) + strlen(code_mid_type) + strlen(code_mid_read) + strlen(code_mid_fmt) + strlen(code_suffix) + 1;
                char *result = malloc(len);
                if (result == NULL)
                    return NULL;
                snprintf(result, len, "%s%s%s%s%s",
                         code_prefix,
                         code_mid_type,
                         code_mid_read,
                         code_mid_fmt,
                         code_suffix);
                return result;
            }
        }
    }

    /* Default: emit program that prints the input string */
    const char *template_prefix =
        "#include <stdio.h>\n"
        "int main(void) { printf(\"%s\\n\", \"";
    const char *template_suffix =
        "\"); return 0; }\n";

    size_t len = strlen(template_prefix) + strlen(input) + strlen(template_suffix) + 1;
    char *result = malloc(len);
    if (result == NULL)
        return NULL;

    snprintf(result, len, "%s%s%s", template_prefix, input, template_suffix);
    return result;
}