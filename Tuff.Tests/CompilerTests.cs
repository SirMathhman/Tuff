using Tuff;
using Xunit;

namespace Tuff.Tests
{
    public class CompilerTests
    {
        [Fact]
        public void Run_EmptyProgram_ReturnsZero()
        {
            int exitCode = TuffCompiler.Run("");
            Assert.Equal(0, exitCode);
        }
    }
}

