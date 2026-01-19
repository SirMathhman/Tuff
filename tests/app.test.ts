import { run } from "../src/app";

async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = 1000,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
}

describe("The application", () => {
  test("should run the simplest program possible", async () => {
    await withTimeout(async () => {
      expect(run("", [])).toStrictEqual([[], 0]);
    });
  });
});
