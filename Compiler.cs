using System;
using System.ComponentModel;
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
            // Try common C compilers in order.
            if (TryCompileWithGccLike("gcc", cFilePath, exePath)) return;
            if (TryCompileWithGccLike("clang", cFilePath, exePath)) return;
            if (TryCompileWithGccLike("cc", cFilePath, exePath)) return;

            if (OperatingSystem.IsWindows() && TryCompileWithCl(cFilePath, exePath)) return;

            throw new InvalidOperationException(
                "No supported C compiler found. Install gcc/clang (recommended) or ensure cl.exe is available (VS Developer Command Prompt)."
            );
        }

        private static bool TryCompileWithGccLike(string compiler, string cFilePath, string exePath)
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = compiler,
                    Arguments = $"-o \"{exePath}\" \"{cFilePath}\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using var process = Process.Start(psi);
                if (process == null) return false;
                process.WaitForExit();

                if (process.ExitCode != 0)
                {
                    string errorOutput = process.StandardError.ReadToEnd();
                    throw new InvalidOperationException($"C compilation with '{compiler}' failed (exit {process.ExitCode}): {errorOutput}");
                }

                return true;
            }
            catch (Win32Exception)
            {
                // compiler not found
                return false;
            }
        }

        private static bool TryCompileWithCl(string cFilePath, string exePath)
        {
            // cl.exe requires a VC toolchain environment. If it isn't available, starting the process will throw.
            string workingDir = Path.GetDirectoryName(exePath) ?? Path.GetTempPath();
            string objPath = Path.Combine(workingDir, Path.GetFileNameWithoutExtension(exePath) + ".obj");

            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "cl",
                    // /TC forces C mode. /Fo sets .obj output, /Fe sets .exe output.
                    Arguments = $"/nologo /TC \"{cFilePath}\" /Fo\"{objPath}\" /Fe\"{exePath}\"",
                    WorkingDirectory = workingDir,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using var process = Process.Start(psi);
                if (process == null) return false;
                process.WaitForExit();

                if (process.ExitCode != 0)
                {
                    string errorOutput = process.StandardError.ReadToEnd();
                    string stdOutput = process.StandardOutput.ReadToEnd();
                    throw new InvalidOperationException($"C compilation with 'cl' failed (exit {process.ExitCode}).\n{stdOutput}\n{errorOutput}");
                }

                // Best-effort cleanup of .obj
                if (File.Exists(objPath))
                {
                    try { File.Delete(objPath); } catch { /* ignore */ }
                }

                return true;
            }
            catch (Win32Exception)
            {
                return false;
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
        /// 
        /// For now, if the Tuff code is a valid integer, treat it as an exit code.
        /// Otherwise, default to exit code 0.
        /// </summary>
        private static string GenerateCStub(string tuffCode)
        {
            int exitCode = 0;

            // Try to parse Tuff code as an integer exit code
            if (!string.IsNullOrWhiteSpace(tuffCode) && int.TryParse(tuffCode.Trim(), out var parsed))
            {
                exitCode = parsed;
            }

            var sb = new StringBuilder();
            sb.AppendLine("#include <stdio.h>");
            sb.AppendLine();
            sb.AppendLine("int main(void) {");
            sb.AppendLine($"    return {exitCode};");
            sb.AppendLine("}");
            return sb.ToString();
        }
    }
}
