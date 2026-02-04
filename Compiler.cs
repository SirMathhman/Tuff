using System;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace Tuff
{
    /// <summary>
    /// Tuff DSL compiler that generates C code and can execute it.
    /// </summary>
    public class TuffCompiler
    {
        /// <summary>
        /// Compiles Tuff DSL code to C code.
        /// </summary>
        /// <param name="tuffCode">The Tuff source code to compile</param>
        /// <returns>Generated C code as a string</returns>
        public static string Compile(string tuffCode)
        {
            // TODO: Implement Tuff DSL to C compiler
            // This is a stub implementation

            if (string.IsNullOrWhiteSpace(tuffCode))
            {
                throw new ArgumentException("Tuff code cannot be empty", nameof(tuffCode));
            }

            // Placeholder: return a simple C program
            return GenerateCStub(tuffCode);
        }

        /// <summary>
        /// Compiles Tuff code and executes the resulting executable.
        /// </summary>
        /// <param name="tuffCode">The Tuff source code to compile and run</param>
        /// <returns>Exit code of the executed program</returns>
        /// <exception cref="InvalidOperationException">Thrown if compilation or execution fails</exception>
        public static int Run(string tuffCode)
        {
            // Step 1: Compile Tuff to C
            string cCode = Compile(tuffCode);

            // Step 2: Write to temporary .c file
            string tempCFile = Path.Combine(Path.GetTempPath(), $"tuff_{Guid.NewGuid()}.c");
            File.WriteAllText(tempCFile, cCode);

            try
            {
                // Step 3: Compile C to executable
                string exeName = Path.Combine(Path.GetTempPath(), $"tuff_{Guid.NewGuid()}.exe");
                CompileCToExecutable(tempCFile, exeName);

                try
                {
                    // Step 4: Run the executable and return exit code
                    return RunExecutable(exeName);
                }
                finally
                {
                    // Clean up the executable
                    if (File.Exists(exeName))
                    {
                        File.Delete(exeName);
                    }
                }
            }
            finally
            {
                // Clean up the temporary C file
                if (File.Exists(tempCFile))
                {
                    File.Delete(tempCFile);
                }
            }
        }

        /// <summary>
        /// Compiles a C file to an executable using the system C compiler.
        /// </summary>
        private static void CompileCToExecutable(string cFilePath, string exePath)
        {
            var psi = new ProcessStartInfo
            {
                FileName = "gcc",
                Arguments = $"-o \"{exePath}\" \"{cFilePath}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            using (var process = Process.Start(psi))
            {
                if (process == null)
                {
                    throw new InvalidOperationException("Failed to start gcc compiler process");
                }

                process.WaitForExit();

                if (process.ExitCode != 0)
                {
                    string errorOutput = process.StandardError.ReadToEnd();
                    throw new InvalidOperationException($"C compilation failed with exit code {process.ExitCode}: {errorOutput}");
                }
            }
        }

        /// <summary>
        /// Runs an executable and returns its exit code.
        /// </summary>
        private static int RunExecutable(string exePath)
        {
            var psi = new ProcessStartInfo
            {
                FileName = exePath,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using (var process = Process.Start(psi))
            {
                if (process == null)
                {
                    throw new InvalidOperationException("Failed to start executable process");
                }

                process.WaitForExit();
                return process.ExitCode;
            }
        }

        /// <summary>
        /// Generates a stub C program from Tuff code.
        /// TODO: Replace with actual Tuff-to-C compilation logic.
        /// </summary>
        private static string GenerateCStub(string tuffCode)
        {
            var sb = new StringBuilder();
            sb.AppendLine("#include <stdio.h>");
            sb.AppendLine();
            sb.AppendLine("int main(void) {");
            sb.AppendLine("    // Stub implementation of Tuff DSL");
            sb.AppendLine("    printf(\"Tuff code executed\\n\");");
            sb.AppendLine("    return 0;");
            sb.AppendLine("}");
            return sb.ToString();
        }
    }
}
