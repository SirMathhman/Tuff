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

    /* Count read<U{N}>() calls and extract the expression */
    const char *read_prefix = "read<U";
    const char *read_suffix = ">()";
    size_t rp_len = strlen(read_prefix);
    size_t rs_len = strlen(read_suffix);

    /* Scan for read patterns and collect bit widths */
    int read_count = 0;
    int read_bits = 0;
    int first_read = 1;

    const char *scan = input;
    while ((scan = strstr(scan, read_prefix)) != NULL)
    {
        const char *close = strstr(scan + rp_len, read_suffix);
        if (close == NULL)
            break;

        char bits_str[16];
        size_t bits_len = close - (scan + rp_len);
        if (bits_len == 0 || bits_len >= sizeof(bits_str))
            break;

        strncpy(bits_str, scan + rp_len, bits_len);
        bits_str[bits_len] = '\0';
        int bits = atoi(bits_str);

        if (first_read)
        {
            read_bits = bits;
            first_read = 0;
        }
        else if (bits != read_bits)
        {
            /* Mismatched bit widths is an error */
            compile_error = UnsupportedBitWidth;
            return NULL;
        }

        read_count++;

        /* Build a modified expression: replace read<U{N}>() with val_{i} */
        /* We'll do the full substitution below */

        scan = close + rs_len;
    }

    if (read_count == 1)
    {
        /* Single read — keep the original single-read path for backward compat */
        /* Re-parse the bit width (already in read_bits) */
        int bits = read_bits;

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
                 code_prefix, code_mid_type, code_mid_read, code_mid_fmt, code_suffix);
        return result;
    }

    if (read_count >= 2)
    {
        /* Ensure all read calls have the same supported bit width */
        if (read_bits != 8 && read_bits != 16)
        {
            compile_error = UnsupportedBitWidth;
            return NULL;
        }

        const char *c_type = (read_bits == 8) ? "unsigned char" : "unsigned short";
        const char *scanf_fmt = (read_bits == 8) ? "%hhu" : "%hu";

        /* Build the expression string with read calls replaced by variable names */
        char expr[1024];
        char *ep = expr;
        const char *src = input;
        int var_idx = 0;

        while (*src)
        {
            const char *rp = strstr(src, read_prefix);
            if (rp == NULL || strstr(rp, read_suffix) == NULL)
            {
                /* Copy remainder */
                size_t remain = strlen(src);
                if ((ep - expr) + remain >= (int)sizeof(expr))
                    break;
                strcpy(ep, src);
                ep += remain;
                break;
            }

            /* Copy text before this read call */
            size_t before = rp - src;
            if ((ep - expr) + before >= (int)sizeof(expr))
                break;
            strncpy(ep, src, before);
            ep += before;

            /* Replace the read call with val_{i} */
            int n = snprintf(ep, sizeof(expr) - (ep - expr), "val_%d", var_idx);
            if (n < 0)
                break;
            ep += n;
            var_idx++;

            src = rp + rp_len;
            const char *close = strstr(src, read_suffix);
            src = close + rs_len;
        }
        *ep = '\0';

        /* Build declaration, reads, and result */
        char code[4096];
        int pos = 0;

        pos += snprintf(code + pos, sizeof(code) - pos,
                        "#include <stdio.h>\n"
                        "int main(void)\n"
                        "{\n");

        /* Declare and read each variable */
        for (int i = 0; i < read_count; i++)
        {
            pos += snprintf(code + pos, sizeof(code) - pos,
                            "    %s val_%d;\n"
                            "    if (scanf(\"%s\", &val_%d) != 1)\n"
                            "        return 1;\n",
                            c_type, i, scanf_fmt, i);
        }

        /* Compute and return the expression */
        pos += snprintf(code + pos, sizeof(code) - pos,
                        "    return (int)(%s);\n"
                        "}\n",
                        expr);

        char *result = malloc(pos + 1);
        if (result == NULL)
            return NULL;
        memcpy(result, code, pos + 1);
        return result;
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