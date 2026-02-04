using Tuff;
using Xunit;

namespace Tuff.Tests
{
    public class CompilerTests
    {
        [Fact]
        public void Run_EmptyProgram_ReturnsZero()
        {
            AssertValid("", 0);
        }

        [Fact]
        public void Run_NumericCode_ReturnsExitCode()
        {
            AssertValid("100", 100);
        }

        private static void AssertValid(string tuffCode, int expectedExitCode)
        {
            int exitCode = TuffCompiler.Run(tuffCode);
            Assert.Equal(expectedExitCode, exitCode);
        }
    }
}

