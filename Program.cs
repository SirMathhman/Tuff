using System;

namespace Tuff
{
    class Program
    {
        static void Main(string[] args)
        {
            try
            {
                // Example: Compile and run Tuff code
                string tuffCode = "print('Hello from Tuff!')";

                Console.WriteLine("Running Tuff code execution...");
                int exitCode = TuffCompiler.Run(tuffCode);

                Console.WriteLine($"Program exited with code: {exitCode}");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Error: {ex.Message}");
                Environment.Exit(1);
            }
        }
    }
}
