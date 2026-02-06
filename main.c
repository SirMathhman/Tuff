#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "interpret.h"

int main(int argc, char **argv)
{
    (void)argc;
    (void)argv;

    // Read lib.tuff from disk
    FILE *input_file = NULL;
    if (fopen_s(&input_file, "lib.tuff", "rb") != 0 || !input_file)
    {
        fprintf(stderr, "Error: Could not open lib.tuff\n");
        return 1;
    }

    // Get file size
    fseek(input_file, 0, SEEK_END);
    long file_size = ftell(input_file);
    fseek(input_file, 0, SEEK_SET);

    if (file_size < 0)
    {
        fprintf(stderr, "Error: Could not determine file size\n");
        fclose(input_file);
        return 1;
    }

    // Allocate buffer and read source
    char *source = (char *)malloc((size_t)file_size + 1);
    if (!source)
    {
        fprintf(stderr, "Error: Memory allocation failed\n");
        fclose(input_file);
        return 1;
    }

    size_t bytes_read = fread(source, 1, (size_t)file_size, input_file);
    fclose(input_file);

    if (bytes_read != (size_t)file_size)
    {
        fprintf(stderr, "Error: Could not read entire file\n");
        free(source);
        return 1;
    }

    source[file_size] = '\0';

    // Compile the source
    printf("Compiling lib.tuff...\n");
    CompileResult result = compile(source);
    free(source);

    if (result.has_error)
    {
        fprintf(stderr, "Compilation error: %s\n", result.error_message);
        return 1;
    }

    // Write generated C code to lib.c
    FILE *output_file = NULL;
    if (fopen_s(&output_file, "lib.c", "wb") != 0 || !output_file)
    {
        fprintf(stderr, "Error: Could not open lib.c for writing\n");
        free(result.code);
        return 1;
    }

    size_t code_length = strlen(result.code);
    size_t bytes_written = fwrite(result.code, 1, code_length, output_file);
    fclose(output_file);
    free(result.code);

    if (bytes_written != code_length)
    {
        fprintf(stderr, "Error: Could not write entire file\n");
        return 1;
    }

    printf("Successfully compiled lib.tuff -> lib.c\n");
    return 0;
}
